require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const path = require('path')
const bcrypt = require('bcrypt')
const { rateLimit } = require('express-rate-limit')
const runMigrations = require('./migrations')
const pool = require('./db')
const authRoutes = require('./routes/auth')
const sessionRoutes = require('./routes/sessions')
const uploadRoutes = require('./routes/uploads')
const spellRoutes = require('./routes/spells')
const setupSocket = require('./socket')

const app = express()
const server = http.createServer(app)

app.set('trust proxy', 1)

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Mobile browsers suspend WebSocket connections when the tab is in background.
// A generous pingTimeout (2 min) prevents the server from dropping sleeping phones.
const SOCKET_PING_TIMEOUT_MS = 120000
const SOCKET_PING_INTERVAL_MS = 25000

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: SOCKET_PING_TIMEOUT_MS,
  pingInterval: SOCKET_PING_INTERVAL_MS,
})

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
})
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/sessions', apiLimiter, sessionRoutes)
app.use('/api/uploads', apiLimiter, uploadRoutes)
app.use('/api/spells', apiLimiter, spellRoutes)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

setupSocket(io)

async function seedAdmin() {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM admins')
    if (parseInt(result.rows[0].count) === 0) {
      const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
      const adminUsername = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
      const hash = await bcrypt.hash(adminPassword, 10)
      await pool.query(
          'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
          [adminUsername, hash]
      )
      console.log(`Default admin created: ${adminUsername} / [password from env]`)
    }
  } catch (err) {
    console.error('Error seeding admin:', err)
  }
}

const PORT = process.env.PORT || 3000

async function start() {
  let retries = 10
  while (retries > 0) {
    try {
      await runMigrations()
      await seedAdmin()
      break
    } catch (err) {
      retries--
      console.log(`DB not ready, retrying... (${retries} left)`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start()
