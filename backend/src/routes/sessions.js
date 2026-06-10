const express = require('express')
const QRCode = require('qrcode')
const path = require('path')
const fs = require('fs').promises
const crypto = require('crypto')
const pool = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()


async function generateUniqueCode(pool) {
  for (let i = 0; i < 20; i++) {
    const code = (1000 + crypto.randomInt(9000)).toString()
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

router.patch('/:id/rename', authenticateToken, async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name required.' })
  try {
    const result = await pool.query(
      'UPDATE sessions SET name = $1 WHERE id = $2 AND created_by = $3 RETURNING *',
      [name.trim(), req.params.id, req.admin.id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Session not found.' })
    res.json(result.rows[0])
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
      const imagesRes = await pool.query('SELECT url, thumbnail_url FROM session_images WHERE session_id = $1', [req.params.id])
      const unlinkAll = []
      for (const img of imagesRes.rows) {
        if (img.url) unlinkAll.push(path.join(__dirname, '../../uploads', img.url.replace(/^\/uploads\//, '')))
        if (img.thumbnail_url) unlinkAll.push(path.join(__dirname, '../../uploads', img.thumbnail_url.replace(/^\/uploads\//, '')))
      }
      await Promise.allSettled(unlinkAll.map(p => fs.unlink(p)))
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

    // Collecter les URLs d'images session (et leurs thumbnails)
    const imgRows = await client.query(
        'SELECT url, thumbnail_url FROM session_images WHERE session_id = $1',
        [sessionId]
    )
    for (const row of imgRows.rows) {
      if (row.url) filesToDelete.push(path.join(__dirname, '../../uploads', row.url.replace(/^\/uploads\//, '')))
      if (row.thumbnail_url) filesToDelete.push(path.join(__dirname, '../../uploads', row.thumbnail_url.replace(/^\/uploads\//, '')))
    }

    // Collecter les avatars joueurs
    const avatarRows = await client.query(
        'SELECT avatar_url FROM players WHERE session_id = $1 AND avatar_url IS NOT NULL',
        [sessionId]
    )
    for (const row of avatarRows.rows) {
      if (row.avatar_url) filesToDelete.push(path.join(__dirname, '../../uploads', row.avatar_url.replace(/^\/uploads\//, '')))
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
    const critHits = rows.filter(e => e.event_type === 'critical_hit')
    const critMisses = rows.filter(e => e.event_type === 'critical_miss')
    const votesStarted = rows.filter(e => e.event_type === 'vote_started')
    const purchasesAccepted = rows.filter(e => e.event_type === 'purchase_accepted')
    const totalDamage = damages.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)
    const totalHeal = heals.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)
    const totalGoldSpent = purchasesAccepted.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)

    const sessionStart = sessionCheck.rows[0].created_at
    const durationMin = rows.length
      ? Math.round((new Date(rows[rows.length - 1].created_at) - new Date(rows[0].created_at)) / 60000)
      : 0

    const summary = [
      `📜 Résumé de session`,
      `⏱️ Durée : ${durationMin} min`,
      `💥 Dégâts totaux : ${totalDamage} PV`,
      `💚 Soins totaux : ${totalHeal} PV`,
      `💀 Morts : ${deaths.length}`,
      deaths.length ? `   ${deaths.map(d => d.player_name).join(', ')}` : '',
      critHits.length ? `⚔️ Critiques réussis : ${critHits.length}` : '',
      critMisses.length ? `💔 Critiques ratés : ${critMisses.length}` : '',
      votesStarted.length ? `🗳️ Votes : ${votesStarted.length}` : '',
      purchasesAccepted.length ? `🛒 Achats : ${purchasesAccepted.length} (${totalGoldSpent} po dépensés)` : '',
    ].filter(Boolean).join('\n')

    res.json({ events: rows, summary })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/:id/journal', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const result = await pool.query('DELETE FROM session_events WHERE session_id = $1', [req.params.id])
    res.json({ deleted: result.rowCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/images', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const { type } = req.query  // ?type=image ou ?type=map
    const query = type
        ? 'SELECT id, url, original_name, type, audio_category, thumbnail_url, tv_label, grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y, grid_cell_w, grid_cell_h, uploaded_at FROM session_images WHERE session_id = $1 AND type = $2 ORDER BY uploaded_at DESC'
        : 'SELECT id, url, original_name, type, audio_category, thumbnail_url, tv_label, grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y, grid_cell_w, grid_cell_h, uploaded_at FROM session_images WHERE session_id = $1 ORDER BY uploaded_at DESC'
    const params = type ? [req.params.id, type] : [req.params.id]
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/:id/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const record = await pool.query(
      'SELECT id FROM session_images WHERE id = $1 AND session_id = $2',
      [req.params.imageId, req.params.id]
    )
    if (!record.rows[0]) return res.status(404).json({ error: 'File not found.' })

    const { original_name, audio_category, tv_label, grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y } = req.body
    const updates = []
    const values = []
    let idx = 1
    if (original_name !== undefined) { updates.push(`original_name = $${idx++}`); values.push(String(original_name).slice(0, 500)) }
    if (audio_category !== undefined) { updates.push(`audio_category = $${idx++}`); values.push(String(audio_category).slice(0, 50)) }
    if (tv_label !== undefined) { updates.push(`tv_label = $${idx++}`); values.push(tv_label ? String(tv_label).slice(0, 200) : null) }
    if (grid_type !== undefined) { updates.push(`grid_type = $${idx++}`); values.push(['none', 'square', 'hex'].includes(grid_type) ? grid_type : 'none') }
    if (grid_cols !== undefined) { updates.push(`grid_cols = $${idx++}`); values.push(grid_cols !== null ? Math.max(1, Math.min(200, parseInt(grid_cols) || 1)) : null) }
    if (grid_rows !== undefined) { updates.push(`grid_rows = $${idx++}`); values.push(grid_rows !== null ? Math.max(1, Math.min(200, parseInt(grid_rows) || 1)) : null) }
    if (grid_hex_orientation !== undefined) { updates.push(`grid_hex_orientation = $${idx++}`); values.push(['flat', 'pointy'].includes(grid_hex_orientation) ? grid_hex_orientation : 'flat') }
    // Offsets are normalised image fractions. ±0.5 is the maximum meaningful shift
    // (half the image width/height), covering all realistic sub-cell alignment scenarios.
    // The frontend slider is bounded by ±1/cols or ±1/rows which is always ≤ 0.5 for
    // the minimum grid size of 2 columns/rows, so these limits are consistent.
    if (grid_offset_x !== undefined) { updates.push(`grid_offset_x = $${idx++}`); values.push(Math.max(-0.5, Math.min(0.5, parseFloat(grid_offset_x) || 0))) }
    if (grid_offset_y !== undefined) { updates.push(`grid_offset_y = $${idx++}`); values.push(Math.max(-0.5, Math.min(0.5, parseFloat(grid_offset_y) || 0))) }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' })

    values.push(req.params.imageId)
    const row = await pool.query(
      `UPDATE session_images SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, url, original_name, type, audio_category, tv_label, grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y, grid_cell_w, grid_cell_h, uploaded_at`,
      values
    )
    res.json(row.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// Relance la détection automatique de grille sur une carte existante,
// persiste le résultat et le retourne.
router.post('/:id/images/:imageId/detect-grid', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const imgRes = await pool.query(
      "SELECT id, url, type FROM session_images WHERE id = $1 AND session_id = $2",
      [req.params.imageId, req.params.id]
    )
    if (!imgRes.rows[0]) return res.status(404).json({ error: 'Image not found.' })
    if (!['map', 'image'].includes(imgRes.rows[0].type)) {
      return res.status(400).json({ error: 'La détection de grille ne s\'applique qu\'aux images.' })
    }

    const path = require('path')
    const filePath = path.join(__dirname, '../../uploads', imgRes.rows[0].url.replace('/uploads/', ''))

    const { detectGridConfig } = require('../gridDetection')
    let grid
    try {
      grid = await detectGridConfig(filePath)
    } catch (err) {
      console.error('[detect-grid] analysis failed:', err.message)
      return res.status(422).json({ error: 'Impossible d\'analyser cette image.' })
    }

    const row = await pool.query(
      `UPDATE session_images
         SET grid_type = $1, grid_cols = $2, grid_rows = $3, grid_hex_orientation = $4,
             grid_offset_x = $5, grid_offset_y = $6
       WHERE id = $7
       RETURNING id, url, original_name, type, audio_category, tv_label, grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y, grid_cell_w, grid_cell_h, uploaded_at`,
      [grid.gridType, grid.gridCols, grid.gridRows, grid.gridHexOrientation,
       grid.gridOffsetX, grid.gridOffsetY, req.params.imageId]
    )
    res.json({ ...row.rows[0], confidence: grid.confidence })
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
        'SELECT url, thumbnail_url FROM session_images WHERE id = $1 AND session_id = $2',
        [req.params.imageId, req.params.id]
    )
    if (!imgRes.rows[0]) return res.status(404).json({ error: 'Image not found.' })

    // Supprimer en base
    await pool.query('DELETE FROM session_images WHERE id = $1', [req.params.imageId])

    // Supprimer le fichier et sa thumbnail sur le disque
    const fs = require('fs').promises
    const path = require('path')
    const { url, thumbnail_url } = imgRes.rows[0]
    await fs.unlink(path.join(__dirname, '../../uploads', url.replace('/uploads/', ''))).catch(() => {})
    if (thumbnail_url) {
      await fs.unlink(path.join(__dirname, '../../uploads', thumbnail_url.replace('/uploads/', ''))).catch(() => {})
    }

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/players', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const result = await pool.query(
      `SELECT id, player_name, ac, max_hp, current_hp, initiative, conditions, is_concentrating, dnd_class, avatar_url
       FROM players WHERE session_id = $1 ORDER BY joined_at ASC`,
      [req.params.id]
    )
    res.json(result.rows)
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

router.get('/:id/factions', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })
    const result = await pool.query(
      'SELECT * FROM factions WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
