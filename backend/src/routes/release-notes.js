const express = require('express')
const path = require('path')
const fs = require('fs')

const router = express.Router()

let cache = null

function getNotes() {
  if (cache) return cache
  try {
    const filePath = path.join(__dirname, '../data/release-notes.json')
    cache = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    console.error('Failed to load release-notes.json:', err)
    cache = { notes: [] }
  }
  return cache
}

getNotes()

router.get('/', (req, res) => {
  res.json(getNotes())
})

module.exports = router
