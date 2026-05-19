const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

router.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }
  // Limit password length to prevent bcrypt DoS (bcrypt is CPU-intensive for large inputs)
  if (typeof password !== 'string' || password.length > 128) {
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
      { id: admin.id, username: admin.username, is_demo: !!admin.is_demo },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({
      token,
      admin: { id: admin.id, username: admin.username, is_demo: !!admin.is_demo },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, is_demo, created_at FROM admins WHERE id = $1', [req.admin.id])
    if (!result.rows[0]) return res.status(404).json({ error: 'Admin not found.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
