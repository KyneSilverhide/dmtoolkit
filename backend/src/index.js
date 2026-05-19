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
const { seedDemoContent, resetDemoContent, scheduleDemoReset } = require('./demo')
const authRoutes = require('./routes/auth')
const sessionRoutes = require('./routes/sessions')
const uploadRoutes = require('./routes/uploads')
const spellRoutes = require('./routes/spells')
const magicItemRoutes = require('./routes/magic-items')
const equipmentRoutes = require('./routes/equipment')
const generateRoutes = require('./routes/generate')
const setupSocket = require('./socket')

const app = express()
const server = http.createServer(app)

app.set('trust proxy', 1)

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Allowed origins: frontend + Obsidian desktop/mobile apps
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'app://obsidian.md',
  'capacitor://obsidian.md',
]

function isAllowedOrigin(origin) {
  if (!origin) return true // same-origin / server-to-server
  return ALLOWED_ORIGINS.includes(origin)
}

// Mobile browsers suspend WebSocket connections when the tab is in background.
// A generous pingTimeout (2 min) prevents the server from dropping sleeping phones.
const SOCKET_PING_TIMEOUT_MS = 120000
const SOCKET_PING_INTERVAL_MS = 25000

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: SOCKET_PING_TIMEOUT_MS,
  pingInterval: SOCKET_PING_INTERVAL_MS,
})

app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
}))
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
// Bypass rate limiters in test mode
const isTest = process.env.NODE_ENV === 'test'
app.use('/api/auth', isTest ? authRoutes : [authLimiter, authRoutes])
app.use('/api/sessions', isTest ? sessionRoutes : [apiLimiter, sessionRoutes])
app.use('/api/uploads', isTest ? uploadRoutes : [apiLimiter, uploadRoutes])
app.use('/api/spells', isTest ? spellRoutes : [apiLimiter, spellRoutes])
app.use('/api/magic-items', isTest ? magicItemRoutes : [apiLimiter, magicItemRoutes])
app.use('/api/equipment', isTest ? equipmentRoutes : [apiLimiter, equipmentRoutes])
app.use('/api/generate', isTest ? generateRoutes : [apiLimiter, generateRoutes])
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
      console.log('Default admin account created')
    }
  } catch (err) {
    console.error('Error seeding admin:', err)
  }
}

async function seedDemoAdmin() {
  // Skip entirely if demo is disabled
  if (process.env.DEMO_ENABLED === 'false') return
  try {
    const existing = await pool.query("SELECT id FROM admins WHERE username = 'demo'")
    if (existing.rows.length === 0) {
      const demoPassword = process.env.DEMO_PASSWORD || 'demo'
      const hash = await bcrypt.hash(demoPassword, 10)
      await pool.query(
        'INSERT INTO admins (username, password_hash, is_demo) VALUES ($1, $2, TRUE)',
        ['demo', hash]
      )
      console.log('Demo admin account created')
    } else {
      // Ensure is_demo flag is set (in case it was created before this feature)
      await pool.query("UPDATE admins SET is_demo = TRUE WHERE username = 'demo'")
    }
  } catch (err) {
    console.error('Error seeding demo admin:', err)
  }
}

const PORT = process.env.PORT || 3000

async function start() {
  let retries = 10
  while (retries > 0) {
    try {
      await runMigrations()
      await seedAdmin()
      await seedDemoAdmin()
      break
    } catch (err) {
      retries--
      console.error(`DB error (${err.message}), retrying... (${retries} left)`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  if (retries === 0) {
    console.error('Database not available after all retries. Exiting.')
    process.exit(1)
  }

  // Demo account seeding + scheduler
  // DEMO_ENABLED       : 'false' = désactiver entièrement
  // DEMO_SEED_ENABLED  : 'false' = ne pas seeder au démarrage
  // DEMO_FORCE_RESEED  : 'true'  = forcer un clean + re-seed au démarrage (utile en dev/CI)
  // DEMO_RESET_ENABLED : 'false' = désactiver le reset nocturne automatique
  if (process.env.DEMO_ENABLED !== 'false') {
    try {
      const demoResult = await pool.query("SELECT id FROM admins WHERE username = 'demo' AND is_demo = TRUE")
      if (demoResult.rows[0]) {
        const demoAdminId = demoResult.rows[0].id
        if (process.env.DEMO_SEED_ENABLED !== 'false') {
          if (process.env.DEMO_FORCE_RESEED === 'true') {
            console.log('[Demo] DEMO_FORCE_RESEED=true — forcing clean + re-seed at startup')
            await resetDemoContent(demoAdminId)
          } else {
            await seedDemoContent(demoAdminId)
          }
        }
        if (process.env.DEMO_RESET_ENABLED !== 'false') {
          scheduleDemoReset(demoAdminId, io)
        }
      }
    } catch (err) {
      console.error('Error initialising demo account:', err)
    }
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start()
