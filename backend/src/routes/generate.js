const express = require('express')
const router = express.Router()
const { OpenAI } = require('openai')
const { authenticateToken } = require('../middleware/auth')

const VALID_TYPES = ['npc_name', 'place_name', 'tavern_name', 'quest_hook', 'npc_description']

// Client instantiated once at module load. Will be null if GITHUB_TOKEN is not set —
// requests will receive 503 in that case (checked at request time).
const openaiClient = process.env.GITHUB_TOKEN
  ? new OpenAI({ baseURL: 'https://models.inference.ai.azure.com', apiKey: process.env.GITHUB_TOKEN })
  : null

function buildPrompt(type, options = {}) {
  switch (type) {
    case 'npc_name': {
      const race = options.race || 'humain'
      const genre = options.genre || 'neutre'
      return `Génère 5 noms de PNJ D&D 5e de race ${race}, genre ${genre}. Retourne uniquement les noms, un par ligne, sans numérotation ni ponctuation supplémentaire.`
    }
    case 'place_name': {
      const typeLieu = options.typeLieu || 'ville'
      return `Génère 5 noms de ${typeLieu} pour un univers D&D 5e médiéval-fantastique. Retourne uniquement les noms, un par ligne, sans numérotation ni ponctuation supplémentaire.`
    }
    case 'tavern_name':
      return `Génère 5 noms d'auberge créatifs et mémorables pour un univers D&D 5e. Retourne uniquement les noms, un par ligne, sans numérotation ni ponctuation supplémentaire.`
    case 'quest_hook':
      return `Génère une accroche de quête originale pour D&D 5e en français. 2 à 3 phrases maximum, percutantes et intrigantes.`
    case 'npc_description': {
      const race = options.race || 'humain'
      return `Génère une courte description physique et de personnalité pour un PNJ D&D 5e de race ${race}. 3 à 4 phrases maximum.`
    }
    default:
      return ''
  }
}

function extractQuota(headers) {
  if (!headers) return { remaining: null, limit: null, resetAt: null }
  const get = typeof headers.get === 'function'
    ? (k) => headers.get(k)
    : (k) => (headers[k] ?? null)
  const remaining = parseInt(get('x-ratelimit-remaining-requests'))
  const limit = parseInt(get('x-ratelimit-limit-requests'))
  return {
    remaining: isNaN(remaining) ? null : remaining,
    limit: isNaN(limit) ? null : limit,
    resetAt: get('x-ratelimit-reset-requests'),
  }
}

router.post('/', authenticateToken, async (req, res) => {
  const { type, options = {} } = req.body

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Type de génération invalide.' })
  }

  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_TOKEN non configuré sur le serveur.' })
  }


  const prompt = buildPrompt(type, options)

  try {
    const { data, response: rawResponse } = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Tu es un assistant créatif pour jeux de rôle D&D 5e. Réponds toujours en français. Sois concis et original.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.9,
    }).withResponse()

    const quota = extractQuota(rawResponse.headers)
    const result = data.choices[0]?.message?.content?.trim() || ''

    res.json({ result, quota })
  } catch (err) {
    console.error(err)
    if (err.status === 429) {
      const quota = extractQuota(err.headers || null)
      return res.status(429).json({ error: 'Quota GitHub Models épuisé.', quota })
    }
    res.status(500).json({ error: 'Erreur lors de la génération.' })
  }
})

module.exports = router
module.exports.buildPrompt = buildPrompt
module.exports.extractQuota = extractQuota
