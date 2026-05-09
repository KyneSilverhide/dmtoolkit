# GitHub Copilot — Instructions pour critical-fail

## Projet
Application web D&D 5e (français) pour la gestion de sessions de JdR.
Monorepo : `frontend/` (Vue 3 + Vite + Pinia) + `backend/` (Node.js + Express + Socket.IO + PostgreSQL).

## Stack & versions
- **Frontend** : Vue 3.5 `<script setup>`, Vite 8, Pinia, Vue Router 4, Vitest, Socket.IO-client 4.8
- **Backend** : Node.js 20, Express 4, Socket.IO 4.8, PostgreSQL 16 (driver `pg`), JWT, bcrypt, multer
- **Docker** : `docker-compose.yml` à la racine (postgres + backend + frontend)

## Commandes de validation
```bash
cd frontend && npm test && npm run build
cd backend && node --check src/index.js src/socket.js src/routes/spells.js src/routes/sessions.js src/migrations.js
```

## Conventions de code

### Frontend
- Utiliser `<script setup>` + Composition API — pas d'Options API
- State global via Pinia (`stores/auth.js`, `stores/session.js`)
- Toujours utiliser `getSocket(token)` et `resetSocket()` depuis `frontend/src/socket.js` — ne jamais instancier `io()` directement
- Les vues sont importées statiquement dans `router/index.js` — pas de lazy-loading
- L'URL backend vient de `import.meta.env.VITE_BACKEND_URL`

### Backend
- CommonJS uniquement (`require`/`module.exports`) — pas d'ESM
- Requêtes SQL directes via le pool `pg` (pas d'ORM)
- Modifications de schéma DB : toujours via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dans `backend/src/migrations.js`
- Handlers socket : pattern `try { ... } catch (err) { console.error(err) }`
- Les joueurs sont supprimés de la DB à la déconnexion socket

## Règles absolues
- Ne jamais modifier le schéma DB autrement qu'en ajoutant à `migrations.js`
- Ne jamais créer un `io()` direct dans le frontend
- Ne jamais utiliser ESM dans le backend
- Ne jamais hardcoder l'URL du backend dans le frontend

## Architecture Socket.IO
Rooms : `session:<id>` (joueurs), `admin:<id>` (MJ), `tv:<id>` (écran TV)

Les événements socket sont en kebab-case français (ex. `join-session`, `hp-updated`, `doom-clock-started`).

## Fonctionnalités principales
- Gestion joueurs : PV, CA, conditions, concentration, initiative
- TV mode : lobby / doom / tension / vote / image / map / merchant
- Battlemap : brouillard de guerre (500 strokes max), tokens joueurs, viewport normalisé
- Sorts : 477 sorts D&D 5e FR, endpoint `GET /api/spells/search?q=` (JWT requis)
- Marchand : panier, négociation de prix, contre-offres
