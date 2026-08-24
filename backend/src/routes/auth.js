const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../db')
const { authenticateToken, requireOwner } = require('../middleware/auth')

const router = express.Router()

// Limite commune anti-DoS bcrypt (CPU-intensif sur de grandes entrées) — appliquée à
// tout champ mot de passe comparé/hashé, comme dans /login.
const MAX_PASSWORD_LENGTH = 128

router.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Invalid credentials.' })
  }
  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username])
    const admin = result.rows[0]
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials.' })
    }
    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' })
    }
    const token = jwt.sign(
      { id: admin.id, username: admin.username, is_demo: !!admin.is_demo, is_owner: !!admin.is_owner },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        is_demo: !!admin.is_demo,
        is_owner: !!admin.is_owner,
        must_change_password: !!admin.must_change_password,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, is_demo, is_owner, must_change_password, created_at FROM admins WHERE id = $1',
      [req.admin.id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Admin not found.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// Changement de mot de passe par l'admin lui-même — utilisé notamment pour le
// changement obligatoire à la première connexion d'un compte créé par le propriétaire
// (must_change_password), mais utilisable à tout moment ensuite.
router.patch('/me/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis.' })
  }
  if (typeof currentPassword !== 'string' || currentPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Mot de passe actuel invalide.', field: 'currentPassword' })
  }
  if (typeof newPassword !== 'string' || newPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Nouveau mot de passe invalide.', field: 'newPassword' })
  }
  try {
    const result = await pool.query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.id])
    const admin = result.rows[0]
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const valid = await bcrypt.compare(currentPassword, admin.password_hash)
    if (!valid) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect.', field: 'currentPassword' })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    const updated = await pool.query(
      `UPDATE admins SET password_hash = $1, must_change_password = FALSE
       WHERE id = $2
       RETURNING id, username, is_demo, is_owner, must_change_password, created_at`,
      [hash, req.admin.id]
    )
    res.json(updated.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// Liste des comptes admin — réservée au propriétaire (écran de gestion des admins).
router.get('/admins', authenticateToken, requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, is_demo, is_owner, must_change_password, created_at FROM admins ORDER BY created_at ASC'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// Création d'un compte admin — réservée au propriétaire. Le mot de passe est choisi par
// le propriétaire (pas d'infra d'invitation par email dans ce projet) : le nouveau compte
// est marqué must_change_password pour forcer son détenteur à en choisir un à lui dès la
// première connexion.
router.post('/admins', authenticateToken, requireOwner, async (req, res) => {
  let { username, password } = req.body
  username = typeof username === 'string' ? username.trim() : ''
  if (!username || !password) {
    return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis.' })
  }
  if (username.length > 100) {
    return res.status(400).json({ error: 'Nom d\'utilisateur trop long.', field: 'username' })
  }
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Mot de passe invalide.', field: 'password' })
  }
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      `INSERT INTO admins (username, password_hash, must_change_password)
       VALUES ($1, $2, TRUE)
       RETURNING id, username, is_demo, is_owner, must_change_password, created_at`,
      [username, hash]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.', field: 'username' })
    }
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
