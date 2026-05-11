const express = require('express')
const QRCode = require('qrcode')
const path = require('path')
const fs = require('fs').promises
const pool = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

const crypto = require('crypto')

async function generateUniqueCode(pool) {
  for (let i = 0; i < 10; i++) {
    const code = (10000000 + crypto.randomInt(90000000)).toString()
    const exists = await pool.query('SELECT id FROM sessions WHERE code = $1', [code])
    if (!exists.rows[0]) return code
  }
  throw new Error('Could not generate unique code')
}

router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'Session name required.' })

  try {
    const code = await generateUniqueCode(pool)
    const result = await pool.query(
      'INSERT INTO sessions (name, code, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, code, req.admin.id]
    )
    const session = result.rows[0]

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const joinUrl = `${frontendUrl}/join/${session.code}`
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

    res.status(201).json({ session, qrCodeDataUrl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE created_by = $1 ORDER BY created_at DESC',
      [req.admin.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/qrcode', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, code, status FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    const session = result.rows[0]
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (session.status !== 'active') return res.status(400).json({ error: 'Session is closed.' })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const joinUrl = `${frontendUrl}/join/${session.code}`
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

    res.json({ qrCodeDataUrl, joinUrl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:code', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, code, name, status, created_at FROM sessions WHERE code = $1 AND status = 'active'",
      [req.params.code]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Session not found or closed.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/:id/close', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE sessions SET status = 'closed' WHERE id = $1 AND created_by = $2 RETURNING *",
      [req.params.id, req.admin.id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    // Clean up session images: delete files and DB records
    try {
      const imagesRes = await pool.query('SELECT url FROM session_images WHERE session_id = $1', [req.params.id])
      for (const img of imagesRes.rows) {
        const filename = path.basename(img.url)
        const filePath = path.join(__dirname, '../../uploads', filename)
        // Silently ignore missing files (may have been manually deleted)
        await fs.unlink(filePath).catch((err) => {
          console.error('Could not delete image file (may already be missing):', filePath, err.code)
        })
      }
      await pool.query('DELETE FROM session_images WHERE session_id = $1', [req.params.id])
    } catch (cleanErr) {
      console.error('Error cleaning session images:', cleanErr)
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/:id/reopen', authenticateToken, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT id, status FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!check.rows[0]) return res.status(404).json({ error: 'Session not found.' })
    if (check.rows[0].status === 'active') return res.status(400).json({ error: 'Session is already active.' })

    const result = await pool.query(
      "UPDATE sessions SET status = 'active' WHERE id = $1 RETURNING *",
      [req.params.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/:id', authenticateToken, async (req, res) => {
  const sessionId = Number(req.params.id)
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id.' })
  }

  const client = await pool.connect()
  const filesToDelete = []

  try {
    await client.query('BEGIN')

    // Vérifie que la session appartient à cet admin
    const exists = await client.query(
        'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
        [sessionId, req.admin.id]
    )
    if (exists.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Session not found.' })
    }

    // Collecter les URLs d'images session
    const imgRows = await client.query(
        'SELECT url FROM session_images WHERE session_id = $1',
        [sessionId]
    )
    for (const row of imgRows.rows) {
      if (row.url) filesToDelete.push(path.join(__dirname, '../../uploads', path.basename(row.url)))
    }

    // Collecter les avatars joueurs
    const avatarRows = await client.query(
        'SELECT avatar_url FROM players WHERE session_id = $1 AND avatar_url IS NOT NULL',
        [sessionId]
    )
    for (const row of avatarRows.rows) {
      if (row.avatar_url) filesToDelete.push(path.join(__dirname, '../../uploads', path.basename(row.avatar_url)))
    }

    // 1) Nullifier current_vote_id (FK vers votes)
    await client.query('UPDATE sessions SET current_vote_id = NULL WHERE id = $1', [sessionId])

    // 2) vote_responses
    await client.query(
        'DELETE FROM vote_responses WHERE vote_id IN (SELECT id FROM votes WHERE session_id = $1)',
        [sessionId]
    )

    // 3) purchase_requests
    await client.query('DELETE FROM purchase_requests WHERE session_id = $1', [sessionId])

    // 4) merchants (merchant_items par CASCADE ON DELETE)
    await client.query('DELETE FROM merchants WHERE session_id = $1', [sessionId])

    // 5) session_images
    await client.query('DELETE FROM session_images WHERE session_id = $1', [sessionId])

    // 6) session_events
    await client.query('DELETE FROM session_events WHERE session_id = $1', [sessionId])

    // 7) dice_results
    await client.query('DELETE FROM dice_results WHERE session_id = $1', [sessionId])

    // 8) messages
    await client.query('DELETE FROM messages WHERE session_id = $1', [sessionId])

    // 9) votes
    await client.query('DELETE FROM votes WHERE session_id = $1', [sessionId])

    // 10) players
    await client.query('DELETE FROM players WHERE session_id = $1', [sessionId])

    // 11) session
    await client.query('DELETE FROM sessions WHERE id = $1', [sessionId])

    await client.query('COMMIT')

    // Suppression fichiers après commit (best effort)
    await Promise.allSettled(
        filesToDelete.map(filePath =>
            fs.unlink(filePath).catch(err => {
              if (err.code !== 'ENOENT') console.warn('Could not delete file:', filePath, err.code)
            })
        )
    )

    return res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Delete session error:', err)
    return res.status(500).json({ error: 'Server error.' })
  } finally {
    client.release()
  }
})

router.get('/:id/journal', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id, created_at FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const events = await pool.query(
      'SELECT * FROM session_events WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    )

    const rows = events.rows
    const damages = rows.filter(e => e.event_type === 'damage')
    const heals = rows.filter(e => e.event_type === 'heal')
    const deaths = rows.filter(e => e.event_type === 'death')
    const totalDamage = damages.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)
    const totalHeal = heals.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)

    const sessionStart = sessionCheck.rows[0].created_at
    const lastEvent = rows.length ? rows[rows.length - 1].created_at : new Date()
    const durationMs = new Date(lastEvent) - new Date(sessionStart)
    const durationMin = Math.round(durationMs / 60000)

    const summary = [
      `📜 Résumé de session`,
      `⏱️ Durée : ${durationMin} min`,
      `💥 Dégâts totaux : ${totalDamage} PV`,
      `💚 Soins totaux : ${totalHeal} PV`,
      `💀 Morts : ${deaths.length}`,
      deaths.length ? `   ${deaths.map(d => d.player_name).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    res.json({ events: rows, summary })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/images', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query  // ?type=image ou ?type=map
    const query = type
        ? 'SELECT id, url, original_name, type, uploaded_at FROM session_images WHERE session_id = $1 AND type = $2 ORDER BY uploaded_at DESC'
        : 'SELECT id, url, original_name, type, uploaded_at FROM session_images WHERE session_id = $1 ORDER BY uploaded_at DESC'
    const params = type ? [req.params.id, type] : [req.params.id]
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/:id/images/:imageId', authenticateToken, async (req, res) => {
  try {
    // Vérifier que la session appartient à cet admin
    const sessionCheck = await pool.query(
        'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
        [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    // Récupérer l'URL pour supprimer le fichier
    const imgRes = await pool.query(
        'SELECT url FROM session_images WHERE id = $1 AND session_id = $2',
        [req.params.imageId, req.params.id]
    )
    if (!imgRes.rows[0]) return res.status(404).json({ error: 'Image not found.' })

    // Supprimer en base
    await pool.query('DELETE FROM session_images WHERE id = $1', [req.params.imageId])

    // Supprimer le fichier sur le disque
    const fs = require('fs').promises
    const path = require('path')
    const filePath = path.join(__dirname, '../../uploads', imgRes.rows[0].url.replace('/uploads/', ''))
    await fs.unlink(filePath).catch(() => {}) // ignorer si déjà absent

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/merchants', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const merchants = await pool.query(
      'SELECT * FROM merchants WHERE session_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    )
    const result = await Promise.all(merchants.rows.map(async (m) => {
      const items = await pool.query(
        'SELECT * FROM merchant_items WHERE merchant_id = $1 ORDER BY category, name',
        [m.id]
      )
      return { ...m, items: items.rows }
    }))
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/purchase-requests', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const requests = await pool.query(
      `SELECT pr.*, mi.name AS item_name, mi.price AS item_price
       FROM purchase_requests pr
       JOIN merchant_items mi ON pr.item_id = mi.id
       WHERE pr.session_id = $1
       ORDER BY pr.created_at DESC`,
      [req.params.id]
    )
    res.json(requests.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
