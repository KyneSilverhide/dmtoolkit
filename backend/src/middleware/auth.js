const jwt = require('jsonwebtoken')

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided.' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    req.admin = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

// Réservé à l'administrateur principal (is_owner) — gestion des comptes admin.
// Lit le claim JWT, même pattern de confiance que is_demo (voir uploads.js/socket.js) :
// une rétrogradation d'un owner reste valide jusqu'à expiration de son token (7j).
function requireOwner(req, res, next) {
  if (!req.admin?.is_owner) return res.status(403).json({ error: 'Réservé à l\'administrateur principal.' })
  next()
}

module.exports = { authenticateToken, requireOwner }
