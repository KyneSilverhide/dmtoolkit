# CLAUDE.md

Application web D&D 5e pour Maître du Jeu (français) : gestion de session en temps réel (joueurs, TV, battlemap, marchand, sorts/objets/races/classes), multi-tenant, avec plugin Obsidian.

---

## Structure

```
/
├── frontend/        # Vue 3 + Vite + Pinia (port 5173)
│   └── src/
│       ├── views/          # HomeView, AdminView, TvView, PlayerInboxView, PlayerJoinView
│       ├── components/     # admin/ player/ — composants par rôle
│       ├── stores/         # auth.js, session.js, releaseNotes.js (Pinia)
│       ├── router/         # index.js — routes statiques uniquement
│       ├── composables/    # useContentTabQuery, useConditions, useAudioLaunch, …
│       ├── utils/          # apiFetch, textLinker, glossary, defensiveTraits, …
│       └── socket.js       # Singleton Socket.IO
├── backend/         # Node.js + Express + Socket.IO (port 3000)
│   └── src/
│       ├── index.js / socket.js / migrations.js / demo.js / db.js
│       ├── middleware/auth.js
│       ├── gridDetection.js
│       ├── data/           # JSON statiques (sorts, objets, races, classes, origines…)
│       │                   # + itemsLoader.js (cache partagé equipment/magic-items)
│       └── routes/         # auth, sessions, uploads, spells, magic-items, equipment,
│                           # races, classes, backgrounds, generate, release-notes, puzzles
│                           # + contentRouterFactory.js (fabrique commune GET /, /public,
│                           #   /public/full, /search pour le contenu de référence statique)
├── obsidian-plugin/ # TypeScript — sync Initiative Tracker ↔ DM Toolkit
├── e2e/             # Playwright — specs/, page-objects/, fixtures/, helpers/
└── docker-compose.yml / docker-compose.prod.yml
```

---

## Commandes de validation

```bash
# Frontend
cd frontend && npm test && npm run build

# Backend (syntaxe uniquement)
cd backend && node --check src/index.js src/socket.js src/routes/spells.js src/routes/sessions.js src/routes/equipment.js src/routes/races.js src/routes/classes.js src/routes/backgrounds.js src/routes/magic-items.js src/routes/generate.js src/routes/release-notes.js src/demo.js src/migrations.js

# E2E (stack Docker requise)
cd e2e && npx playwright test

# Dev local
cd backend && npm run dev
cd frontend && npm run dev
```

---

## Stack

| Couche | Tech | Version |
|---|---|---|
| Frontend | Vue 3 `<script setup>` + Vite + Pinia + Vue Router 4 | ^3.5 / ^8.0 / ^4.4 |
| Tests frontend | Vitest | ^4.1 |
| Backend | Node.js 20 + Express + Socket.IO | ^4.19 / ^4.8 |
| DB | PostgreSQL 16 (`pg`) | — |
| Auth | JWT (jsonwebtoken HS256) + bcrypt | ^9.0 / ^5.1 |
| Upload | multer + sharp | ^2.1 / ^0.34 |

---

## Règles non-déductibles du code

### Base de données
- **Jamais de DDL manuel.** Toujours `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` à la fin de `migrations.js`.
- Ne jamais supprimer de colonnes existantes.
- Le code de session `0000` est **réservé** à la session démo — jamais généré par la logique normale (génère 1000–9999).
- `purchase_requests.item_id` référence `merchant_items(id)` **sans** `ON DELETE CASCADE`. Un `DELETE FROM merchant_items` sur un item déjà référencé par une ligne `purchase_requests` (même `accepted`/`rejected`, ces lignes ne sont jamais purgées) échoue sur la contrainte FK. Avant de supprimer un `merchant_item`, vérifier l'absence d'historique (`SELECT 1 FROM purchase_requests WHERE item_id = …`) et archiver (`stock = 0`) plutôt que supprimer si l'historique existe — voir le handler socket `update-merchant`.

### Backend
- **CommonJS uniquement** — pas d'`import`/`export` ESM.
- Les erreurs dans les handlers socket sont catchées avec `console.error(err)` — pattern à respecter.
- Quand une erreur socket émise vers un joueur concerne un champ précis d'un formulaire (ex. `join-session`), inclure `field` dans le payload `error` (`{ message, field: 'sessionCode' }`) en plus de `message`, pour que le frontend affiche l'erreur au plus près du champ fautif plutôt qu'en bas de page. Omettre `field` pour une erreur générique.
- `middleware/auth.js` renvoie **401** pour token absent/invalide/expiré, **403** uniquement pour les erreurs métier (ex. : session pas la vôtre). Le frontend distingue les deux.
- CORS : autoriser `app://obsidian.md` et `capacitor://obsidian.md` en plus de `FRONTEND_URL`.

### Frontend
- **Ne jamais créer `io()` directement.** Toujours `getSocket(token)` / `resetSocket()` depuis `frontend/src/socket.js`.
- **Ne jamais appeler `fetch(BACKEND_URL…)` avec `Authorization: Bearer` directement.** Utiliser `apiFetch()` (`utils/apiFetch.js`) — intercepte les 401 pour déconnecter.
- **Pas de lazy-loading** dans `router/index.js` — les vues sont importées statiquement, leur CSS est chargé globalement dans le bundle.
- Routes : `/admin/:tab?` (nom `admin`, sans session active), `/admin/session/:code/:tab?` (nom `admin-session`, session active — `:code` n'est jamais optionnel ici, contrairement à `:tab?` : un `/admin/:code?/:tab?` unique serait ambigu au matching, un segment comme `spells` pourrait être capturé comme `code` plutôt que `tab`), `/view/:code/:tab?` (nom `player-view`), `/player/:tab?` (nom `player-self`), `/tv/:code`.
- **Ne jamais construire une URL/route `/admin/...` à la main.** Utiliser `adminTabRoute(tab, query?)` (`utils/adminRoute.js`) pour naviguer vers un onglet admin, et `contentBasePath(route)` (`utils/contentRoutes.js`) pour les liens internes vers le contenu (RefLink, clics délégués) — ces helpers choisissent `admin` vs `admin-session` selon `sessionStore.activeSession`.
- Dans un `FormData` d'upload avatar : appender `sessionCode` **avant** le champ `file` — multer résout le tenant dans `destination()` au moment où le flux arrive.
- Onglets "Contenu" (Sorts/Objets/Races/Classes/Origines/Aptitudes) sont accessibles **sans session active** — ne pas y lire l'état de session.

### Données statiques (`backend/src/data/`)
- Ne pas déplacer les fichiers JSON hors de ce dossier.
- `dnd_classes.json` : descriptions = paraphrases complètes, **jamais copie verbatim** du PHB/aidedd (copyright). Chaque détail mécanique (coûts, dés, DD, portées) doit être conservé.

---

## Variables d'environnement

| Variable | Côté | Description |
|---|---|---|
| `DATABASE_URL` | backend | URL PostgreSQL |
| `JWT_SECRET` | backend | Clé JWT (obligatoire en prod) |
| `PORT` | backend | Port Express (défaut 3000) |
| `FRONTEND_URL` | backend | URL frontend (CORS + QR) |
| `VITE_BACKEND_URL` | frontend | URL backend (Socket.IO + fetch) |
| `GITHUB_TOKEN` | backend | Token GitHub Models (gpt-4o-mini) — optionnel, 503 si absent |
| `DEMO_ENABLED` | backend | `false` pour désactiver le compte démo (défaut `true`) |
| `DEMO_PASSWORD` | backend | Mot de passe démo (défaut `demo`) |
| `DEMO_SEED_ENABLED` | backend | `false` pour ne pas re-seeder au démarrage |
| `DEMO_FORCE_RESEED` | backend | `true` pour forcer un clean+reseed complet |
| `DEMO_RESET_ENABLED` | backend | `false` pour désactiver le reset nocturne à minuit |

---

## Ce qu'il ne faut pas faire

- ❌ Modifier le schéma DB autrement qu'en ajoutant des migrations dans `migrations.js`
- ❌ Supprimer des colonnes DB existantes
- ❌ Créer un `io()` dans le frontend — utiliser `getSocket()` / `resetSocket()`
- ❌ Appeler `fetch(…)` avec `Authorization: Bearer` hors de `apiFetch()`
- ❌ Ajouter du lazy-loading dans `router/index.js`
- ❌ Utiliser ESM (`import`/`export`) dans le backend
- ❌ Hardcoder l'URL du backend dans le frontend (utiliser `VITE_BACKEND_URL`)
- ❌ Restreindre le CORS à `FRONTEND_URL` seul (oublier les origines Obsidian)
- ❌ Déplacer les fichiers JSON de `backend/src/data/`
- ❌ Utiliser le code `0000` pour autre chose que la session démo
- ❌ Copier verbatim du texte PHB/aidedd dans `dnd_classes.json`

---

## Maintenance de ce fichier

Mettre à jour CLAUDE.md dans le même commit si :
- Nouveau fichier majeur dans `backend/src/` ou nouvelle route
- Nouvelle table ou colonne DB avec contrainte métier non-évidente
- Nouvelle variable d'environnement
- Nouvelle règle ou piège découvert

Le hook Stop `.claude/hooks/check-docs.ps1` avertit si des fichiers source changent sans mise à jour doc.

---

## MCP Tools: code-review-graph

**Toujours utiliser les outils `code-review-graph` AVANT Grep/Glob/Read pour explorer le code.** Le graph est plus rapide et donne le contexte structural (callers, dépendants) que le scan de fichiers ne peut pas donner.

Outils clés : `semantic_search_nodes`, `query_graph`, `get_impact_radius`, `detect_changes`, `get_review_context`, `get_architecture_overview`.