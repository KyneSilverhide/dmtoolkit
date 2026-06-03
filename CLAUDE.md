# CLAUDE.md — Contexte projet pour Claude Code

Ce fichier est lu automatiquement par Claude Code à chaque session. Il contient tout le contexte nécessaire pour travailler efficacement sur ce dépôt.

---

## Résumé du projet

**DM Toolkit** est une application web de gestion de sessions de jeu de rôle D&D 5e (en français), destinée au Maître du Jeu (MJ). Elle permet :

- La gestion en temps réel des joueurs (PV, CA, conditions, concentration, initiative)
- L'affichage sur un écran TV dédié (vue spectateur)
- L'envoi de messages et jets de dés aux joueurs
- Des systèmes de vote, d'horloge de doom, d'échelle de tension, timer et round de combat
- Un système de marchand interactif avec panier et négociation de prix
- Une battlemap interactive avec brouillard de guerre et tokens de joueurs
- La recherche de sorts D&D 5e (477 sorts FR depuis `aidedd_spells.json`)
- La recherche d'équipement standard et d'objets magiques D&D 5e
- Un générateur IA de noms (PNJ, lieux, auberges), accroches de quêtes et descriptions via GitHub Models (gpt-4o-mini)
- Un gestionnaire audio côté admin : upload de fichiers audio (MP3/WAV/OGG/FLAC/M4A), organisés par catégorie (ambiance/musique/effets/autre), lecture multi-piste simultanée avec volume et boucle par piste, renommage inline
- Une isolation multi-tenant : chaque admin ne voit que ses propres sessions, et les fichiers uploadés sont stockés par tenant (`/uploads/<adminId>/`)
- Un système de release notes intégré : cloche de notification dans l'en-tête (MJ et joueur), modal filtré par rôle (`admin`/`player`/`all`), dernier numéro de version vu en localStorage (`rn-last-viewed`)
- Un plugin Obsidian pour synchroniser l'Initiative Tracker avec DM Toolkit

---

## Architecture du monorepo

```
/
├── frontend/          # Vue 3 + Vite + Pinia (port 5173 en dev)
│   ├── src/
│   │   ├── views/     # HomeView, AdminView, TvView, PlayerInboxView, PlayerJoinView
│   │   ├── components/admin/  # Composants admin (MapManager, MerchantManager, GeneratorTool, AudioManager, PuzzleManager, ReputationManager, SessionJournal, etc.)
│   │   │                      # SessionJournal : journal des événements en temps réel, stats de session (durée, dégâts totaux, soins totaux), boutons "Effacer le journal" et "Réinitialiser session"
│   │   ├── components/player/ # Composants joueur (SpellSearchTool, MagicItemSearchTool, PlayerDiceTool, etc.)
│   │   ├── components/AppIcon.vue  # Composant icônes dynamiques (remplace les emojis statiques)
│   │   ├── components/ReleaseNotesBell.vue  # Cloche de notification (prop role="admin"|"player")
│   │   ├── components/ReleaseNotesModal.vue # Modal release notes (Teleport+Transition, filtre par rôle)
│   │   ├── stores/    # Pinia stores (auth.js, session.js, releaseNotes.js)
│   │   ├── router/    # Vue Router (toutes les vues importées statiquement)
│   │   ├── utils/     # Utilitaires (conditions.js, playerProfiles.js, playerSessionMemory.js, themePreferences.js, generatorUtils.js)
│   │   └── socket.js  # Singleton Socket.IO client
├── backend/           # Node.js + Express + Socket.IO (port 3000)
│   ├── src/
│   │   ├── index.js       # Point d'entrée Express + Socket.IO
│   │   ├── socket.js      # Tous les handlers Socket.IO
│   │   ├── migrations.js  # Migrations SQL (PostgreSQL) — exécutées au démarrage
│   │   ├── demo.js        # Compte démo : seed, reset nocturne, scheduler (code 0000 réservé)
│   │   ├── db.js          # Pool PostgreSQL (pg, max 20 connexions)
│   │   ├── middleware/auth.js  # Vérification JWT (HS256 explicite)
│   │   ├── data/          # Fichiers JSON de données statiques
│   │   │   ├── aidedd_spells.json        # 477 sorts D&D 5e en français
│   │   │   ├── aidedd_magic_items.json   # Objets magiques D&D 5e
│   │   │   ├── release-notes.json        # Notes de version (triées plus récentes en premier)
│   │   │   └── aidedd_standard_items.json # 147 objets standard D&D 5e
│   │   └── routes/        # auth, sessions, uploads, spells, magic-items, equipment, generate, release-notes, puzzles
│   │                      # uploads: POST /api/uploads (images, 50MB), POST /api/uploads/audio (audio, 150MB)
│   │                      # uploads: POST /api/uploads/puzzle (HTML, 5MB) — enregistre type='puzzle' dans session_images
│   │                      # puzzles: GET /api/puzzles/serve/:imageId?seed=SEED (public, sans auth) — sert le HTML avec PRNG injecté
│   │                      # release-notes: GET /api/release-notes (public, sans auth)
│   │                      # sessions: GET/DELETE/PATCH /api/sessions/:id/images/:imageId
│   │                      # sessions: GET /api/sessions/:id/journal (résumé IA : durée calculée entre premier et dernier événement, 0 si journal vide)
│   │                      # sessions: DELETE /api/sessions/:id/journal (efface tous les session_events)
│   │                      # (+ GET /api/sessions/:id/players pour sync Obsidian)
├── obsidian-plugin/   # Plugin Obsidian (TypeScript) — sync Initiative Tracker ↔ DM Toolkit
├── e2e/               # Tests Playwright (TypeScript) — specs dans e2e/specs/, page objects dans e2e/page-objects/
│   ├── fixtures/      # Worker-level isolation : adminToken, _reset (nettoyage DB entre tests)
│   ├── helpers/       # createSession, joinAsPlayer, loginAsAdmin
│   └── page-objects/  # AdminPage, TvPage, PlayerPage
├── docker-compose.yml     # Postgres 16 + backend + frontend
└── docker-compose.prod.yml
```

---

## Commandes de validation

```bash
# Frontend — tests unitaires (Vitest) + build Vite
cd frontend && npm test && npm run build

# Backend — vérification syntaxique Node.js (pas de tests automatisés)
cd backend && node --check src/index.js src/socket.js src/routes/spells.js src/routes/sessions.js src/routes/equipment.js src/routes/generate.js src/routes/release-notes.js src/demo.js src/migrations.js

# E2E — tests Playwright (nécessite stack Docker démarrée)
cd e2e && npx playwright test

# Dev local (sans Docker)
cd backend && npm run dev   # node --watch src/index.js
cd frontend && npm run dev  # vite dev server
```

---

## Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Frontend framework | Vue 3 (`<script setup>`) | ^3.5 |
| Frontend build | Vite | ^8.0 |
| Frontend state | Pinia | via `stores/` |
| Frontend routing | Vue Router 4 | ^4.4 |
| Frontend tests | Vitest | ^4.1 |
| Backend runtime | Node.js | 20 (alpine) |
| Backend framework | Express | ^4.19 |
| Temps réel | Socket.IO | ^4.8 |
| Base de données | PostgreSQL | 16 |
| Authentification | JWT (jsonwebtoken) | ^9.0 |
| Hachage | bcrypt | ^5.1 |
| Upload fichiers | multer | ^2.1 |
| Traitement images | sharp | ^0.34 |
| QR Code | qrcode | ^1.5 |

---

## Authentification

- **Backend** : JWT signé avec `process.env.JWT_SECRET`. Le token est envoyé dans le header `Authorization: Bearer <token>`.
- **Admin par défaut** : créé au démarrage si absent (`username=admin`, mot de passe dans l'env).
- **Socket.IO** : le token JWT est passé via `socket.handshake.auth.token`. Le middleware socket vérifie le token et positionne `socket.admin` si valide. Les joueurs n'ont pas de token, ils s'authentifient uniquement via leur nom dans la session.
- **Frontend** : `getSocket(token)` crée un singleton Socket.IO — le token n'est appliqué qu'à la première création. Utiliser `resetSocket()` avant de créer un nouveau socket avec un token différent (ex. : déconnexion, kick).

---

## Base de données — règles importantes

- **Ne jamais modifier le schéma directement.** Toujours ajouter des `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` à la fin du fichier `backend/src/migrations.js`. Les migrations sont exécutées au démarrage via `runMigrations()`.
- La DB est PostgreSQL 16. Les requêtes utilisent le driver `pg` (pool de connexions dans `db.js`).
- Tables principales : `admins`, `sessions`, `players`, `messages`, `dice_results`, `votes`, `vote_responses`, `session_events`, `merchants`, `merchant_items`, `purchase_requests`, `session_images`, `factions`.
- Table `factions` : `id`, `session_id` (FK sessions ON DELETE CASCADE), `name` (VARCHAR 200), `min_value` (INTEGER, défaut -5), `max_value` (INTEGER, défaut 5), `current_value` (INTEGER, défaut 0), `created_at`. Chaque session peut avoir N factions. Route REST : `GET /api/sessions/:id/factions`.
- Colonnes clés de `sessions` : `tv_mode` (lobby/doom/tension/timescale/vote/image/map/merchant/puzzle/reputation), `current_map_url`, `map_fog_enabled`, `map_viewport` (JSON), `map_fog_strokes` (JSON, max 500 strokes), `map_tokens` (JSON), `doom_clock_*`, `tension_*`, `current_vote_id`, `current_merchant_id`, `combat_round` (entier), `timer_label` (VARCHAR 200), `timer_end_at` (TIMESTAMP), `lobby_bg_url` (VARCHAR 500, image de fond du lobby TV à 15 % d'opacité), `current_puzzle_image_id` (INTEGER), `current_puzzle_url` (VARCHAR 500), `current_puzzle_seed` (VARCHAR 100), `current_image_label` (VARCHAR 200 : label affiché en overlay top-left sur la TV quand une image est projetée).
- Colonnes `timescale_*` de `sessions` : `timescale_title` (VARCHAR 200), `timescale_total_hours` (INTEGER, ex: 24), `timescale_slot_count` (INTEGER, nb de paliers), `timescale_rest_slots` (INTEGER, durée du repos long en paliers), `timescale_elapsed_slots` (INTEGER, paliers écoulés). Toutes nullable ; si `timescale_title` est NULL l'échelle est inactive.
- Colonnes clés de `session_images` : `url`, `original_name` (nom d'affichage, renommable), `type` (`image` / `map` / `audio`), `audio_category` (VARCHAR 50 : catégorie libre assignée par l'IA (GPT-4o-mini via GitHub Models) au moment de l'upload ; défaut `Général` si GITHUB_TOKEN absent ou si l'IA échoue ; l'admin peut saisir/modifier librement depuis l'AudioManager), `thumbnail_url` (VARCHAR 500 : URL du WebP 400px généré par `sharp` après upload pour les types `image` et `map` — null pour les fichiers audio ou si la génération échoue ; les galeries admin utilisent cette URL avec fallback sur `url`), `tv_label` (VARCHAR 200 : label optionnel affiché en overlay top-left sur la TV lors de la projection — saisie inline dans l'ImageManager, sauvegardé via PATCH).
- Colonnes clés de `players` : `ac`, `max_hp`, `current_hp`, `initiative`, `conditions` (JSON array), `is_concentrating`, `dnd_class`, `avatar_url`, `socket_id`.
- Les joueurs sont supprimés de la DB à la déconnexion socket (`disconnect`/`leave-session`).
- Les codes de session sont sur **4 chiffres numériques** (migration automatique des anciens codes).
- Le code `0000` est **réservé** à la session de démonstration du compte `demo` — il n'est jamais généré par la logique normale (qui génère entre 1000 et 9999).
- La colonne `admins.is_demo` (BOOLEAN) identifie le compte de démonstration. Son contenu est effacé et re-seedé chaque nuit à minuit via `backend/src/demo.js`.

---

## Architecture Socket.IO

### Rooms (namespaces de salle)
- `session:<sessionId>` — tous les joueurs d'une session
- `admin:<sessionId>` — l'admin de la session
- `tv:<sessionId>` — le(s) écran(s) TV de la session

### Événements entrants (client → serveur)

#### Joueurs
| Événement | Description |
|---|---|
| `join-session` | Rejoindre une session (code, playerName, ac, hp, maxHp, dndClass, avatarUrl) |
| `leave-session` | Quitter la session |
| `update-hp` | Mettre à jour les PV courants |
| `update-max-hp` | Mettre à jour les PV max |
| `update-conditions` | Mettre à jour les conditions |
| `update-concentration` | Basculer la concentration |
| `update-initiative` | Mettre à jour l'initiative |
| `player-roll` | Envoyer un jet de dé effectué par le joueur (résultat transmis à l'admin) |
| `submit-vote` | Voter pour une option |
| `request-purchase` | Demander l'achat d'un objet (legacy) |
| `request-batch-purchase` | Demander l'achat d'un panier d'objets |
| `respond-counter-offer` | Accepter/refuser une contre-offre |

#### TV
| Événement | Description |
|---|---|
| `tv-join` | Rejoindre la room TV (`{ sessionCode }`) — reçoit le snapshot TV |

#### Admin (nécessite `socket.admin`)
| Événement | Description |
|---|---|
| `admin-join` | Rejoindre la room admin + recevoir le snapshot |
| `set-tv-mode` | Changer le mode TV |
| `start-doom-clock` | Démarrer l'horloge de doom |
| `stop-doom-clock` | Arrêter l'horloge de doom |
| `create-tension-scale` | Créer une échelle de tension |
| `increment-tension-scale` | Avancer l'échelle de tension |
| `end-tension-scale` | Terminer l'échelle de tension |
| `create-vote` | Créer un vote |
| `close-vote` | Fermer un vote |
| `show-image` | Afficher une image sur le TV |
| `set-lobby-bg` | Définir/effacer l'image de fond du lobby (`{ sessionId, imageUrl: string\|null }`) |
| `show-map` | Afficher une battlemap sur le TV |
| `map-set-fog` | Activer/désactiver le brouillard |
| `map-viewport-update` | Mettre à jour la vue de la map |
| `map-fog-clear` | Révéler des zones (ajout de strokes) |
| `map-fog-reset` | Réinitialiser le brouillard |
| `map-token-move` | Déplacer un token de joueur |
| `map-token-remove` | Retirer un token de joueur |
| `send-message` | Envoyer un message à un ou tous les joueurs |
| `send-dice-result` | Envoyer un résultat de jet de dé |
| `send-gold-split` | Envoyer une répartition d'or entre joueurs |
| `create-merchant` | Créer un marchand |
| `show-merchant` | Afficher le marchand sur le TV |
| `close-merchant` | Fermer le marchand |
| `delete-merchant` | Supprimer définitivement un marchand |
| `respond-purchase` | Répondre à une demande d'achat (legacy) |
| `respond-batch-purchase` | Répondre à un panier d'achat |
| `set-combat-round` | Définir le round de combat courant |
| `start-timer` | Démarrer un timer (`{ sessionId, label, durationSeconds }`) |
| `stop-timer` | Arrêter le timer actif |
| `kick-player` | Expulser un joueur |
| `obsidian-sync-initiatives` | Sync depuis Obsidian Initiative Tracker — met à jour les initiatives en masse par nom de joueur (`{ sessionId, updates: [{playerName, initiative}] }`) |
| `admin-update-hp` | Met à jour les PV d'un joueur par nom (pour sync Obsidian) — `{ sessionId, playerName, currentHp }` |
| `obsidian-play-audio` | Déclenche la lecture d'une piste audio depuis Obsidian — `{ sessionId, trackId }` — relayé à l'admin via `audio-play-requested` |
| `obsidian-stop-audio` | Arrête une piste audio depuis Obsidian — `{ sessionId, trackId }` — relayé via `audio-stop-requested` |
| `obsidian-loop-audio` | Active/désactive la boucle d'une piste depuis Obsidian — `{ sessionId, trackId, loop: boolean }` — relayé via `audio-loop-requested` |
| `obsidian-volume-audio` | Règle le volume d'une piste depuis Obsidian — `{ sessionId, trackId, volume: 0..1 }` — relayé via `audio-volume-requested` |
| `create-time-scale` | Créer une échelle temporelle (`{ sessionId, title, totalHours, slotCount, restSlots }`) — passe tv_mode à 'timescale' |
| `advance-time-scale` | Avancer d'un palier (`{ sessionId }`) |
| `long-rest-time-scale` | Prendre un repos long (`{ sessionId }`) — avance de restSlots paliers |
| `end-time-scale` | Terminer l'échelle de temps (`{ sessionId }`) |
| `show-puzzle` | Afficher un puzzle HTML sur le TV et chez les joueurs (`{ sessionId, imageId }`) — génère un seed aléatoire |
| `close-puzzle` | Fermer le puzzle actif (`{ sessionId }`) — retour en mode lobby |
| `create-faction` | Créer une faction (`{ sessionId, name, minValue, maxValue, initialValue }`) |
| `update-faction-value` | Modifier la réputation d'une faction (`{ sessionId, factionId, delta }`) |
| `delete-faction` | Supprimer une faction (`{ sessionId, factionId }`) |
| `show-reputation` | Projeter les réputations sur la TV (`{ sessionId }`) — passe tv_mode à 'reputation' |

#### Joueurs (puzzle)
| Événement | Description |
|---|---|
| `puzzle-click` | Clic d'un joueur sur le puzzle (`{ sessionId, path: number[] }`) — chemin DOM par indices enfant |

### Événements sortants (serveur → client)

| Événement | Cible | Description |
|---|---|---|
| `session-joined` | joueur | Confirmation de connexion à la session |
| `players-snapshot` | admin | Liste initiale des joueurs |
| `admin-state` | admin | État complet de la session (TV mode, doom clock, etc.) |
| `tv-snapshot` | TV | État complet pour l'écran TV (inclut `currentImageLabel` quand une image est active) |
| `player-joined` | admin + TV | Un joueur a rejoint |
| `player-left` | admin + TV | Un joueur a quitté/été expulsé |
| `hp-updated` | admin + TV | Mise à jour des PV (courants ou max) |
| `hp-update-confirmed` | joueur | Confirmation mise à jour PV courants |
| `max-hp-update-confirmed` | joueur | Confirmation mise à jour PV max |
| `conditions-updated` | admin + TV | Mise à jour des conditions |
| `concentration-updated` | admin + TV | Mise à jour de la concentration |
| `concentration-confirmed` | joueur | Confirmation bascule de concentration |
| `concentration-warning` | joueur | Alerte jet de sauvegarde de concentration |
| `initiative-updated` | admin + TV | Mise à jour de l'initiative |
| `initiative-confirmed` | joueur | Confirmation mise à jour initiative |
| `player-roll-result` | admin | Résultat d'un jet de dé effectué côté joueur |
| `player-roll-confirmed` | joueur | Confirmation du jet de dé (visible) |
| `player-roll-hidden-sent` | joueur | Confirmation du jet de dé masqué envoyé à l'admin |
| `tv-mode-changed` | TV + admin | Changement de mode TV (pour `image` : inclut `imageUrl` et `imageLabel`) |
| `doom-clock-started` | TV + admin | Démarrage de l'horloge doom |
| `doom-clock-stopped` | TV + admin | Arrêt de l'horloge doom |
| `tension-scale-updated` | TV + admin | Mise à jour de l'échelle de tension |
| `tension-scale-ended` | TV + admin | Fin de l'échelle de tension |
| `round-updated` | TV + admin | Round de combat mis à jour |
| `timer-updated` | TV + admin | Données du timer actif |
| `timer-stopped` | TV + admin | Timer arrêté |
| `lobby-bg-updated` | TV + admin | Image de fond du lobby mise à jour (`{ url: string\|null }`) |
| `vote-started` | TV + session + admin | Vote démarré |
| `vote-updated` | TV + admin | Mise à jour des résultats du vote |
| `vote-closed` | TV + session + admin | Vote fermé |
| `vote-submitted` | joueur | Confirmation de vote |
| `vote-error` | joueur | Erreur de vote |
| `map-state` | TV + admin | État complet de la battlemap |
| `map-fog-updated` | TV + admin | Activation/désactivation du brouillard |
| `map-viewport-changed` | TV | Mise à jour de la vue |
| `map-fog-patch` | TV + admin | Nouvelles strokes de révélation |
| `map-fog-reset` | TV + admin | Réinitialisation du brouillard |
| `map-token-moved` | TV + admin | Token déplacé |
| `map-token-removed` | TV + admin | Token retiré |
| `new-message` | joueur(s) | Nouveau message du MJ |
| `dice-result` | joueur(s) | Résultat de jet de dé |
| `session-event` | admin | Événement de session (log) |
| `merchant-created` | admin | Marchand créé |
| `merchant-shown` | session | Marchand affiché aux joueurs |
| `merchant-closed` | session | Marchand fermé |
| `merchant-deleted` | admin | Marchand supprimé définitivement |
| `merchant-updated` | admin | Données marchand mises à jour |
| `merchant-items-updated` | TV + session | Mise à jour des stocks |
| `purchase-request` | admin | Demande d'achat reçue |
| `purchase-requested` | joueur | Confirmation de la demande |
| `purchase-error` | joueur | Erreur d'achat |
| `purchase-counter-offer` | joueur | Contre-offre de l'admin |
| `counter-offer-result` | joueur | Résultat de la contre-offre |
| `counter-offer-response` | admin | Réponse du joueur à la contre-offre |
| `purchase-responded` | admin | Confirmation réponse admin |
| `batch-accepted` | joueur | Panier accepté |
| `batch-rejected` | joueur | Panier refusé |
| `kicked` | joueur | Joueur expulsé |
| `audio-play-requested` | admin | Lecture d'une piste audio déclenchée depuis Obsidian — `{ trackId }` |
| `audio-stop-requested` | admin | Arrêt d'une piste audio déclenché depuis Obsidian — `{ trackId }` |
| `audio-loop-requested` | admin | Changement de boucle déclenché depuis Obsidian — `{ trackId, loop: boolean }` |
| `audio-volume-requested` | admin | Changement de volume déclenché depuis Obsidian — `{ trackId, volume: 0..1 }` |
| `time-scale-updated` | TV + admin | Échelle de temps mise à jour — `{ title, totalHours, slotCount, restSlots, elapsedSlots, slotHours }` |
| `time-scale-ended` | TV + admin | Échelle de temps terminée |
| `puzzle-started` | TV + session + admin | Puzzle affiché — `{ puzzleImageId, puzzleSeed, puzzleClicks: [] }` |
| `puzzle-closed` | TV + session + admin | Puzzle fermé |
| `puzzle-cell-clicked` | TV + session + admin (sauf émetteur) | Clic relayé — `{ path: number[] }` |
| `faction-created` | admin | Faction créée — `{ faction }` |
| `faction-deleted` | admin | Faction supprimée — `{ factionId }` |
| `factions-updated` | admin + TV | Liste complète des factions mise à jour — `[faction, ...]` |
| `reputation-toast` | TV | Changement de réputation quand tv_mode ≠ 'reputation' — `{ factionName, oldValue, newValue, delta }` |
| `demo-reset` | session + admin + TV | Réinitialisation du compte démo — déclenche `window.location.reload()` côté client |
| `error` | émetteur | Erreur générique |
| `tv-control-error` | admin | Erreur de contrôle TV |
| `send-error` | admin | Erreur d'envoi de message |

---

## Conventions de code

### Frontend
- Vue 3 avec `<script setup>` et Composition API — pas d'Options API
- Pinia pour le state management global (`stores/auth.js`, `stores/session.js`)
- Vue Router 4 — toutes les vues sont importées **statiquement** dans `router/index.js` (pas de lazy-loading), ce qui inclut leur CSS globalement dans le bundle
- Socket.IO via le singleton `getSocket(token)` — **ne jamais créer un `io()` directement**, toujours utiliser `getSocket()` et `resetSocket()` de `frontend/src/socket.js`
- L'URL du backend vient de `import.meta.env.VITE_BACKEND_URL` (fallback `http://localhost:3000`)
- **Bouton d'action primaire** (form-commit standalone en bas de formulaire) : `width: 100%`, `padding: 0.6rem 1rem`, `font-size: 0.8rem`, `background: var(--gradient-accent-action)`, `border: 1px solid var(--color-gold-dark)`. Ne pas appliquer aux boutons inline avec un input (search, select+send), ni aux grilles de contrôles compacts (TvControls, MapManager).
- **`font-family` avec variables CSS** : toujours ajouter `, sans-serif` après le `var()` — ex : `font-family: var(--font-heading), sans-serif;`. Toutes les variables `--font-*` du projet sont `sans-serif`; le fallback générique est requis par la spec CSS et évite les warnings linter.
- **Responsive `PlayerInboxView`** — trois breakpoints : `< 640px` mobile (tab bar en bas, layout colonne unique), `640px–1023px` tablette (tab bar en bas, onglet Combat en 2 colonnes CSS grid 3fr/2fr), `≥ 1024px` desktop (sidebar gauche 160px `.sidebar-nav`, tab bar cachée, onglet Combat 2 colonnes). Les items de navigation sont **dupliqués** entre `.sidebar-nav` et `.tab-bar` — toute modification d'un onglet doit être répercutée aux deux endroits. Le shell intermédiaire `.inbox-lower` (flex row sur desktop) contient la sidebar et `.inbox-main` (flex: 1, flex column) qui héberge le puzzle-overlay et le contenu scrollable.

### Backend
- CommonJS (`require`/`module.exports`), pas d'ESM
- Pas de framework ORM — requêtes SQL directes via le pool `pg`
- Toutes les modifications de schéma DB passent par `migrations.js` (jamais de DDL manuel)
- Les erreurs dans les handlers socket sont catchées silencieusement avec `console.error(err)` — pattern à respecter
- Validation des entrées via `parseInt`, `Math.max/min`, et constantes de limites définies en haut de `socket.js`

---

## Variables d'environnement

| Variable | Où | Description |
|---|---|---|
| `DATABASE_URL` | backend | URL PostgreSQL |
| `JWT_SECRET` | backend | Clé secrète JWT (obligatoire en prod) |
| `PORT` | backend | Port Express (défaut 3000) |
| `FRONTEND_URL` | backend | URL du frontend pour CORS et QR codes |
| `VITE_BACKEND_URL` | frontend (build) | URL du backend pour le client Socket.IO et fetch |
| `GITHUB_TOKEN` | backend | Token GitHub (classic, aucun scope requis) pour le générateur IA via GitHub Models (gpt-4o-mini). Optionnel — sans ce token, `POST /api/generate` retourne 503. |
| `DEMO_ENABLED` | backend | Met à `false` pour désactiver entièrement le compte démo (défaut : `true`) |
| `DEMO_PASSWORD` | backend | Mot de passe du compte `demo` (défaut : `demo`) |
| `DEMO_SEED_ENABLED` | backend | Met à `false` pour ne pas re-seeder le contenu démo au démarrage (défaut : `true`) |
| `DEMO_FORCE_RESEED` | backend | Met à `true` pour forcer un clean + re-seed complet du contenu démo à chaque démarrage (défaut : `false`) |
| `DEMO_RESET_ENABLED` | backend | Met à `false` pour désactiver le reset nocturne automatique à minuit (défaut : `true`) |

---

## Ce qu'il ne faut pas faire

- ❌ Ne pas modifier le schéma DB autrement qu'en ajoutant des `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` à la fin de `migrations.js`
- ❌ Ne pas créer un nouveau `io()` dans le frontend — utiliser `getSocket()` / `resetSocket()`
- ❌ Ne pas ajouter de lazy-loading dans `router/index.js` sans comprendre l'impact sur le CSS global
- ❌ Ne pas utiliser d'ESM (`import`/`export`) dans le backend (CommonJS uniquement)
- ❌ Ne pas supprimer de colonnes DB existantes (les données en prod seraient perdues)
- ❌ Ne pas hardcoder l'URL du backend dans le frontend (toujours utiliser `VITE_BACKEND_URL`)
- ❌ Ne pas restreindre le CORS à `FRONTEND_URL` uniquement — les origines `app://obsidian.md` et `capacitor://obsidian.md` doivent aussi être autorisées (plugin Obsidian desktop/mobile)
- ❌ Ne pas déplacer les fichiers JSON de données hors de `backend/src/data/` — les routes `spells`, `magic-items` et `equipment` chargent depuis ce dossier
- ❌ Dans un FormData d'upload avatar, toujours appender `sessionCode` **avant** le champ `file` — multer résout le dossier tenant dans `destination()` au moment où le flux fichier arrive ; les champs après le fichier ne sont pas encore dans `req.body`
- ❌ Ne pas utiliser le code de session `0000` pour autre chose que la session démo — il est réservé et ne sera jamais généré par la logique normale
- ❌ Ne pas supprimer ou renommer le compte `demo` dans la DB sans mettre à jour `seedDemoAdmin()` dans `index.js`

---

## Maintenance de la documentation

### Quand mettre à jour ce fichier (CLAUDE.md)

Mettre à jour CLAUDE.md **dans le même commit** que tout changement touchant :

| Ce qui change | Section à mettre à jour |
|---|---|
| Nouveau fichier dans `backend/src/` ou nouvelle route | Architecture du monorepo |
| Nouvel événement Socket.IO (entrant ou sortant) | Architecture Socket.IO |
| Nouvelle table ou colonne DB | Base de données — règles importantes |
| Nouvelle variable d'environnement | Variables d'environnement |
| Nouveau composant Vue majeur dans `components/admin/` | Architecture du monorepo |
| Changement de version d'une dépendance clé | Stack technique |
| Nouvelle règle ou piège découvert | Ce qu'il ne faut pas faire |

### Quand mettre à jour README.md

README.md est orienté utilisateur (installation, fonctionnalités). Mettre à jour si :
- Une nouvelle variable d'environnement est ajoutée
- Une commande de lancement ou de validation change
- Une fonctionnalité majeure est ajoutée ou supprimée

Le hook Stop `.claude/hooks/check-docs.ps1` avertit automatiquement si des fichiers source changent sans mise à jour de la documentation.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
