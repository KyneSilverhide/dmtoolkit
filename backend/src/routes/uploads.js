const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { OpenAI } = require('openai')
const sharp = require('sharp')
const { authenticateToken } = require('../middleware/auth')
const pool = require('../db')
const { detectGridConfig } = require('../gridDetection')

const THUMB_WIDTH = 400
const THUMB_SUFFIX = '_thumb.webp'

/**
 * Generates a WebP thumbnail for an image file.
 * Returns the thumbnail URL path (relative to UPLOADS_DIR root) or null on failure.
 */
async function generateThumbnail(filePath, uploadsDir) {
  try {
    const ext = path.extname(filePath)
    const thumbPath = filePath.slice(0, -ext.length) + THUMB_SUFFIX
    await sharp(filePath)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbPath)
    const relPath = path.relative(uploadsDir, thumbPath).replace(/\\/g, '/')
    return `/uploads/${relPath}`
  } catch (err) {
    console.error('[upload] thumbnail generation failed:', err.message)
    return null
  }
}

const DEFAULT_AUDIO_CATEGORY = 'Général'

const aiClient = process.env.GITHUB_TOKEN
  ? new OpenAI({ baseURL: 'https://models.inference.ai.azure.com', apiKey: process.env.GITHUB_TOKEN })
  : null

async function categorizeTracksChunk(filenames) {
  const list = filenames.join('\n')
  const completion = await aiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu es un assistant pour jeux de rôle D&D 5e. Réponds uniquement avec du JSON valide, sans markdown ni explication.' },
      { role: 'user', content: `Voici des noms de fichiers audio D&D. Pour chacun, donne une courte catégorie (1-2 mots français, ex : "Combat", "Ambiance", "Taverne", "Forêt", "Donjons", "Musique", "Effet sonore"). Retourne un objet JSON {"nom_fichier": "catégorie"} :\n${list}` },
    ],
    max_tokens: 1500,
    temperature: 0.2,
  })
  const raw = completion.choices[0]?.message?.content?.trim() || '{}'
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (parseErr) {
    console.error('[upload] AI JSON parse error:', parseErr.message, '— raw:', raw.slice(0, 200))
    return {}
  }
}

async function categorizeTracks(filenames) {
  if (!aiClient || filenames.length === 0) return {}
  const CHUNK = 20
  const result = {}
  try {
    for (let i = 0; i < filenames.length; i += CHUNK) {
      const chunk = filenames.slice(i, i + CHUNK)
      const partial = await categorizeTracksChunk(chunk)
      Object.assign(result, partial)
    }
  } catch (err) {
    console.error('[upload] AI categorize error:', err.message)
  }
  return result
}

const router = express.Router()

const UPLOADS_DIR = path.join(__dirname, '../../uploads')

// Demo account upload limits
const DEMO_MAX_FILE_BYTES  = 1 * 1024 * 1024        // 1 MB per file
const DEMO_MAX_TOTAL_BYTES = 500 * 1024 * 1024       // 500 MB total per session

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

const AUDIO_ALLOWED_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/mp4', 'audio/x-m4a',
  'audio/aac', 'audio/webm',
]
const AUDIO_ALLOWED_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm']

const audioFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if (!AUDIO_ALLOWED_MIMES.includes(file.mimetype) && !AUDIO_ALLOWED_EXTS.includes(ext)) {
    return cb(new Error('Format invalide. Formats acceptés : MP3, WAV, OGG, FLAC, M4A, AAC, WebM.'))
  }
  cb(null, true)
}

const VIDEO_ALLOWED_MIMES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-matroska', 'video/x-m4v', 'video/mpeg',
]
const VIDEO_ALLOWED_EXTS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.mkv', '.m4v', '.mpeg', '.mpg']

const videoFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if (!file.mimetype.startsWith('video/') && !VIDEO_ALLOWED_MIMES.includes(file.mimetype) && !VIDEO_ALLOWED_EXTS.includes(ext)) {
    return cb(new Error('Format invalide. Formats acceptés : MP4, WebM, OGG, MOV, MKV, M4V.'))
  }
  cb(null, true)
}

// Multer instances — normal limits
const audioUploadAdmin = multer({
  storage: adminStorage,
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: audioFilter,
})

const videoUploadAdmin = multer({
  storage: adminStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: videoFilter,
})

const upload = multer({
  storage: adminStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: imageFilter,
})

// Multer instances — demo limits (1 MB per file)
const demoUploadImage = multer({
  storage: adminStorage,
  limits: { fileSize: DEMO_MAX_FILE_BYTES },
  fileFilter: imageFilter,
})

const demoUploadAudio = multer({
  storage: adminStorage,
  limits: { fileSize: DEMO_MAX_FILE_BYTES },
  fileFilter: audioFilter,
})

const demoUploadVideo = multer({
  storage: adminStorage,
  limits: { fileSize: DEMO_MAX_FILE_BYTES },
  fileFilter: videoFilter,
})

const HTML_SIZE_LIMIT = 5 * 1024 * 1024

const htmlFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if (ext !== '.html' && ext !== '.htm') {
    return cb(new Error('Seul le format HTML est accepté pour les puzzles.'))
  }
  cb(null, true)
}

const puzzleUploadAdmin = multer({ storage: adminStorage, limits: { fileSize: HTML_SIZE_LIMIT }, fileFilter: htmlFilter })
const demoPuzzleUpload = multer({ storage: adminStorage, limits: { fileSize: DEMO_MAX_FILE_BYTES }, fileFilter: htmlFilter })

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

// Picks the right Multer instance (demo vs normal) and converts Multer errors to JSON responses.
function handleUpload(normalInstance, demoInstance, fields) {
  return (req, res, next) => {
    const instance = req.admin?.is_demo ? demoInstance : normalInstance
    instance.fields(fields)(req, res, (err) => {
      if (!err) return next()
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Limite du mode démo : chaque fichier ne peut pas dépasser 1 Mo.`,
        })
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Trop de fichiers envoyés simultanément.' })
      }
      // fileFilter errors (format invalide, etc.) — renvoyer le message directement
      if (err.message) {
        return res.status(400).json({ error: err.message })
      }
      next(err)
    })
  }
}

// Returns true if adding newBytes to the session's tracked storage would exceed the demo quota.
async function exceedsDemoTotal(sessionId, newBytes) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(file_size), 0)::bigint AS total FROM session_images WHERE session_id = $1',
    [sessionId]
  )
  return Number(rows[0].total) + newBytes > DEMO_MAX_TOTAL_BYTES
}

// Deletes uploaded files from disk (best-effort, errors are non-fatal).
function removeFiles(files) {
  for (const f of files) {
    fs.unlink(f.path, err => { if (err) console.error('[upload] cleanup error:', err) })
  }
}

router.post('/',
  authenticateToken,
  handleUpload(upload, demoUploadImage, [
    { name: 'file',  maxCount: 1  },
    { name: 'files', maxCount: 20 },
  ]),
  async (req, res) => {
    const uploadedFiles = [...(req.files?.files || []), ...(req.files?.file || [])]
    if (uploadedFiles.length === 0) return res.status(400).json({ error: 'No file uploaded.' })

    const sessionId = req.body.session_id
    const urls = uploadedFiles.map(fileToUrl)

    if (sessionId) {
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, req.admin.id]
        )
        if (sessionCheck.rows[0]) {
          // Demo total storage check
          if (req.admin.is_demo) {
            const newBytes = uploadedFiles.reduce((s, f) => s + f.size, 0)
            if (await exceedsDemoTotal(sessionId, newBytes)) {
              removeFiles(uploadedFiles)
              return res.status(413).json({
                error: `Limite du mode démo atteinte : le stockage total est limité à 500 Mo par session.`,
              })
            }
          }

          const type = req.body.type || 'image'
          for (let i = 0; i < uploadedFiles.length; i++) {
            const thumbUrl = await generateThumbnail(uploadedFiles[i].path, UPLOADS_DIR)
            // Détection automatique de la grille pour les battlemaps
            let grid = { gridType: 'none', gridCols: null, gridRows: null, gridHexOrientation: 'flat', gridOffsetX: 0, gridOffsetY: 0, gridCellW: null, gridCellH: null }
            if (type === 'map') {
              try {
                grid = await detectGridConfig(uploadedFiles[i].path)
              } catch (err) {
                console.error('[upload] grid detection failed:', err.message)
              }
            }
            await pool.query(
              `INSERT INTO session_images
                 (session_id, url, original_name, type, file_size, thumbnail_url,
                  grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y, grid_cell_w, grid_cell_h)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [sessionId, urls[i], uploadedFiles[i].originalname, type, uploadedFiles[i].size, thumbUrl,
               grid.gridType, grid.gridCols, grid.gridRows, grid.gridHexOrientation, grid.gridOffsetX, grid.gridOffsetY, grid.gridCellW, grid.gridCellH]
            )
          }
        }
      } catch (err) { console.error(err) }
    }

    return res.json({ url: urls.length === 1 ? urls[0] : null, urls })
  }
)

// Audio upload endpoint — admin only
router.post('/audio',
  authenticateToken,
  handleUpload(audioUploadAdmin, demoUploadAudio, [
    { name: 'files', maxCount: 50 },
    { name: 'file',  maxCount: 1  },
  ]),
  async (req, res) => {
    const uploadedFiles = [...(req.files?.files || []), ...(req.files?.file || [])]
    if (uploadedFiles.length === 0) return res.status(400).json({ error: 'No file uploaded.' })

    const sessionId = req.body.session_id
    const urls = uploadedFiles.map(fileToUrl)

    if (sessionId) {
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, req.admin.id]
        )
        if (sessionCheck.rows[0]) {
          // Demo total storage check
          if (req.admin.is_demo) {
            const newBytes = uploadedFiles.reduce((s, f) => s + f.size, 0)
            if (await exceedsDemoTotal(sessionId, newBytes)) {
              removeFiles(uploadedFiles)
              return res.status(413).json({
                error: `Limite du mode démo atteinte : le stockage total est limité à 500 Mo par session.`,
              })
            }
          }

          const aiCategories = await categorizeTracks(uploadedFiles.map(f => f.originalname))
          for (let i = 0; i < uploadedFiles.length; i++) {
            const category = aiCategories[uploadedFiles[i].originalname] || DEFAULT_AUDIO_CATEGORY
            await pool.query(
              'INSERT INTO session_images (session_id, url, original_name, type, audio_category, file_size) VALUES ($1, $2, $3, $4, $5, $6)',
              [sessionId, urls[i], uploadedFiles[i].originalname, 'audio', category, uploadedFiles[i].size]
            )
          }
        }
      } catch (err) { console.error(err) }
    }

    return res.json({ url: urls.length === 1 ? urls[0] : null, urls })
  }
)

// Video upload endpoint — admin only
router.post('/video',
  authenticateToken,
  handleUpload(videoUploadAdmin, demoUploadVideo, [
    { name: 'files', maxCount: 20 },
    { name: 'file',  maxCount: 1  },
  ]),
  async (req, res) => {
    const uploadedFiles = [...(req.files?.files || []), ...(req.files?.file || [])]
    if (uploadedFiles.length === 0) return res.status(400).json({ error: 'No file uploaded.' })

    const sessionId = req.body.session_id
    const urls = uploadedFiles.map(fileToUrl)

    if (sessionId) {
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, req.admin.id]
        )
        if (sessionCheck.rows[0]) {
          // Demo total storage check
          if (req.admin.is_demo) {
            const newBytes = uploadedFiles.reduce((s, f) => s + f.size, 0)
            if (await exceedsDemoTotal(sessionId, newBytes)) {
              removeFiles(uploadedFiles)
              return res.status(413).json({
                error: `Limite du mode démo atteinte : le stockage total est limité à 500 Mo par session.`,
              })
            }
          }

          for (let i = 0; i < uploadedFiles.length; i++) {
            await pool.query(
              "INSERT INTO session_images (session_id, url, original_name, type, file_size) VALUES ($1, $2, $3, 'video', $4)",
              [sessionId, urls[i], uploadedFiles[i].originalname, uploadedFiles[i].size]
            )
          }
        }
      } catch (err) { console.error(err) }
    }

    return res.json({ url: urls.length === 1 ? urls[0] : null, urls })
  }
)

// Reclassify a batch of audio tracks for a session using AI.
// Body: { session_id, ids: [id, ...] }  — ids is required (send chunks of ~20 from the client)
router.post('/audio/reclassify', authenticateToken, async (req, res) => {
  if (!aiClient) {
    return res.status(503).json({ error: 'GITHUB_TOKEN non configuré — IA indisponible.' })
  }
  const { session_id: sessionId, ids } = req.body
  if (!sessionId || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'session_id et ids[] requis.' })
  }
  const parsedIds = ids.map(id => Number(id))
  if (parsedIds.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'ids[] doit contenir uniquement des identifiants numériques valides.' })
  }

  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
      [sessionId, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(403).json({ error: 'Session introuvable.' })

    const { rows: tracks } = await pool.query(
      "SELECT id, original_name FROM session_images WHERE id = ANY($1::int[]) AND session_id = $2 AND type = 'audio'",
      [parsedIds, sessionId]
    )
    if (tracks.length === 0) return res.json({ updated: 0, categories: {} })

    const filenames = tracks.map(t => t.original_name).filter(Boolean)
    const aiCategories = await categorizeTracksChunk(filenames)

    let updated = 0
    for (const track of tracks) {
      const category = aiCategories[track.original_name]
      if (category) {
        await pool.query(
          'UPDATE session_images SET audio_category = $1 WHERE id = $2',
          [category, track.id]
        )
        updated++
      }
    }
    res.json({ updated, categories: aiCategories })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur lors de la reclassification.' })
  }
})

// Public endpoint for player avatar uploads (no admin auth required)
router.post('/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  res.json({ url: fileToUrl(req.file) })
})

// HTML puzzle upload — admin only
router.post('/puzzle',
  authenticateToken,
  (req, res, next) => {
    const instance = req.admin?.is_demo ? demoPuzzleUpload : puzzleUploadAdmin
    instance.single('file')(req, res, err => {
      if (!err) return next()
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Le fichier dépasse 5 Mo.' })
      if (err.message) return res.status(400).json({ error: err.message })
      next(err)
    })
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé.' })
    const sessionId = req.body.session_id
    const url = fileToUrl(req.file)
    if (sessionId) {
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, req.admin.id]
        )
        if (sessionCheck.rows[0]) {
          const { rows } = await pool.query(
            "INSERT INTO session_images (session_id, url, original_name, type, file_size) VALUES ($1, $2, $3, 'puzzle', $4) RETURNING id",
            [sessionId, url, req.file.originalname, req.file.size]
          )
          return res.json({ url, id: rows[0].id })
        }
      } catch (err) { console.error(err) }
    }
    res.json({ url })
  }
)

module.exports = router
