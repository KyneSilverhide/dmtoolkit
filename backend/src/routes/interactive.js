const express = require('express')
const { serveHtmlPage } = require('./puzzles')

const router = express.Router()

// GET /api/interactive/serve/:imageId?seed=SEED — page interactive (pilotée par le MJ seul).
// Même service que les puzzles : le script de relais injecté sert de repli aux pages qui
// ne parlent pas le pont dmt-bridge (voir frontend/src/utils/interactiveBridge.js).
router.get('/serve/:imageId', serveHtmlPage('interactive'))

module.exports = router
