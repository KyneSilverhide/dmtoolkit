const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')
const pool = require('../db')

const router = express.Router()

const UPLOADS_DIR = path.join(__dirname, '../../uploads')

const makeFilename = (req, file, cb) => {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  const ext = path.extname(file.originalname)
  cb(null, `${unique}${ext}`)
}

// Storage pour uploads authentifiés — sous-dossier par admin_id
const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, String(req.admin.id))
    fs.mkdir(dir, { recursive: true }, err => cb(err, dir))
  },
  filename: makeFilename,
})

// Storage pour avatars publics — résout l'admin_id depuis le sessionCode
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionCode = req.body.sessionCode
    if (!sessionCode) {
      const dir = path.join(UPLOADS_DIR, 'public')
      return fs.mkdir(dir, { recursive: true }, err => cb(err, dir))
    }
    pool.query('SELECT created_by FROM sessions WHERE code = $1', [sessionCode])
      .then(result => {
        const adminId = result.rows[0]?.created_by
        const dir = path.join(UPLOADS_DIR, adminId ? String(adminId) : 'public')
        fs.mkdir(dir, { recursive: true }, err => cb(err, dir))
      })
      .catch(() => {
        const dir = path.join(UPLOADS_DIR, 'public')
        fs.mkdir(dir, { recursive: true }, err => cb(err, dir))
      })
  },
  filename: makeFilename,
})

const imageFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only images allowed.'))
  }
  cb(null, true)
}

const upload = multer({
  storage: adminStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: imageFilter,
})

const AVATAR_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const AVATAR_ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!AVATAR_ALLOWED_MIMES.includes(file.mimetype) || !AVATAR_ALLOWED_EXTS.includes(ext)) {
      return cb(new Error('Format invalide. Formats acceptés : JPG, PNG, WebP, GIF.'))
    }
    cb(null, true)
  },
})

const fileToUrl = (file) => {
  const relPath = path.relative(UPLOADS_DIR, file.path).replace(/\\/g, '/')
  return `/uploads/${relPath}`
}

router.post('/', authenticateToken, upload.fields([
  { name: 'file', maxCount: 1 }, // backward compatibility
  { name: 'files', maxCount: 20 },
]), async (req, res) => {
  const uploadedFiles = [...(req.files?.files || []), ...(req.files?.file || [])]
  if (uploadedFiles.length === 0) return res.status(400).json({ error: 'No file uploaded.' })

  const urls = uploadedFiles.map(fileToUrl)
  if (req.body.session_id) {
    try {
      // Verify the session belongs to this admin before linking uploaded files
      const sessionCheck = await pool.query(
        'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
        [req.body.session_id, req.admin.id]
      )
      if (sessionCheck.rows[0]) {
        const type = req.body.type || 'image'
        for (let i = 0; i < uploadedFiles.length; i++) {
          const url = urls[i]
          const originalName = uploadedFiles[i].originalname
          await pool.query(
              'INSERT INTO session_images (session_id, url, original_name, type) VALUES ($1, $2, $3, $4)',
              [req.body.session_id, url, originalName, type]
          )
        }
      }
    } catch (err) { console.error(err) }
  }

  return res.json({ url: urls.length === 1 ? urls[0] : null, urls })
})

// Public endpoint for player avatar uploads (no admin auth required)
router.post('/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  res.json({ url: fileToUrl(req.file) })
})

module.exports = router
