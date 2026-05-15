const express = require('express')
const multer = require('multer')
const path = require('path')
const { authenticateToken } = require('../middleware/auth')
const pool = require('../db')

const router = express.Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'))
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const ext = path.extname(file.originalname)
    cb(null, `${unique}${ext}`)
  },
})

const imageFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only images allowed.'))
  }
  cb(null, true)
}

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: imageFilter,
})

const AVATAR_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const AVATAR_ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!AVATAR_ALLOWED_MIMES.includes(file.mimetype) || !AVATAR_ALLOWED_EXTS.includes(ext)) {
      return cb(new Error('Format invalide. Formats acceptés : JPG, PNG, WebP, GIF.'))
    }
    cb(null, true)
  },
})

router.post('/', authenticateToken, upload.fields([
  { name: 'file', maxCount: 1 }, // backward compatibility
  { name: 'files', maxCount: 20 },
]), async (req, res) => {
  const uploadedFiles = [...(req.files?.files || []), ...(req.files?.file || [])]
  if (uploadedFiles.length === 0) return res.status(400).json({ error: 'No file uploaded.' })

  const urls = uploadedFiles.map(file => `/uploads/${file.filename}`)
  if (req.body.session_id) {
    try {
      const type = req.body.type || 'image'
      for (let i = 0; i < uploadedFiles.length; i++) {
        const url = urls[i]
        const originalName = uploadedFiles[i].originalname
        await pool.query(
            'INSERT INTO session_images (session_id, url, original_name, type) VALUES ($1, $2, $3, $4)',
            [req.body.session_id, url, originalName, type]
        )
      }
    } catch (err) { console.error(err) }
  }

  return res.json({ url: urls.length === 1 ? urls[0] : null, urls })
})

// Public endpoint for player avatar uploads (no admin auth required)
router.post('/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  res.json({ url: `/uploads/${req.file.filename}` })
})

module.exports = router
