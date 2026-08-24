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
│       │                   # + ThemePicker.vue / DensityToggle.vue (réglages partagés)
│       │                   # player/PlayerNav.vue — navigation joueur (source unique)
│       │                   # player/PlayerGrimoireIndex.vue — index des familles de contenu
│       ├── styles/         # tokens.derive.css — échelles invariantes par thème (L1)
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
- **Partage de session.** `sessions.visibility` (`'private'` par défaut / `'public'`) et `sessions.share_code` (nullable, unique) + table `session_shares (session_id, admin_id)` portent le partage multi-admin. La fonction SQL `session_editable(session_id, admin_id)` (définie dans `migrations.js`, `CREATE OR REPLACE`) centralise le prédicat d'accès « contenu de jeu » : propriétaire (`created_by`), OU présent dans `session_shares`, OU session publique — sauf si l'appelant est un compte démo (`admins.is_demo`), qui n'accède jamais au contenu d'un autre admin. Cette fonction est appelée directement dans le SQL des routes/handlers (`... AND session_editable(id, $N)`), jamais recalculée en JS — voir `assertSessionAccess()` dans `socket.js` pour le cas où seule l'existence de l'accès importe. Les actions de cycle de vie d'une session (renommer/fermer/rouvrir/supprimer/changer `visibility`/générer ou révoquer `share_code`) testent **toujours** `created_by` directement, jamais `session_editable()` — un collaborateur ne les voit même pas dans l'UI (`SessionManager.vue`, `ownership !== 'mine'`). Révoquer un `share_code` (le mettre à `NULL`) n'affecte pas les lignes déjà présentes dans `session_shares` : seules les futures adhésions sont bloquées, il n'y a pas de route pour retirer un collaborateur.

### Backend
- **CommonJS uniquement** — pas d'`import`/`export` ESM.
- Les erreurs dans les handlers socket sont catchées avec `console.error(err)` — pattern à respecter.
- Quand une erreur socket émise vers un joueur concerne un champ précis d'un formulaire (ex. `join-session`), inclure `field` dans le payload `error` (`{ message, field: 'sessionCode' }`) en plus de `message`, pour que le frontend affiche l'erreur au plus près du champ fautif plutôt qu'en bas de page. Omettre `field` pour une erreur générique.
- `middleware/auth.js` renvoie **401** pour token absent/invalide/expiré, **403** uniquement pour les erreurs métier (ex. : session pas la vôtre). Le frontend distingue les deux.
- CORS : autoriser `app://obsidian.md` et `capacitor://obsidian.md` en plus de `FRONTEND_URL`.
- `apiLimiter` (express-rate-limit) a été retiré des routes de contenu (`index.js`) — l'instance est privée et la recherche globale (Ctrl+K) fan-out sur toutes les routes de contenu, ce qui atteignait le plafond de 200 req/15 min en une seule frappe. `authLimiter` reste actif sur `/api/auth` (anti-bruteforce login).
- **Multi-admin.** `admins.is_owner` distingue l'administrateur principal (un seul en pratique, promu par `seedAdmin()` à la création — ou par la migration `is_owner` pour les installs existantes, qui promeut le plus ancien compte non-démo) des comptes réguliers. Seul un `is_owner` peut créer d'autres admins (`POST /api/auth/admins`, `GET /api/auth/admins`) via le middleware `requireOwner` (`middleware/auth.js`) — celui-ci lit le claim `is_owner` du JWT, même niveau de confiance que `is_demo` ailleurs dans le code (pas de round-trip DB), donc une rétrogradation reste valide jusqu'à expiration du token (7j). Un compte créé par le propriétaire reçoit `must_change_password = TRUE` : le mot de passe initial est choisi par le propriétaire (pas d'infra d'invitation par email dans ce projet), et `AdminForcePasswordModal.vue` bloque l'UI admin tant que `PATCH /api/auth/me/password` n'a pas été appelé avec succès. Cet écran de blocage est **frontend uniquement** — le backend ne vérifie `must_change_password` sur aucune autre route, ce n'est pas un verrou serveur.

### Frontend
- **Ne jamais créer `io()` directement.** Toujours `getSocket(token)` / `resetSocket()` depuis `frontend/src/socket.js`.
- **Ne jamais appeler `fetch(BACKEND_URL…)` avec `Authorization: Bearer` directement.** Utiliser `apiFetch()` (`utils/apiFetch.js`) — intercepte les 401 pour déconnecter.
- **Pas de lazy-loading** dans `router/index.js` — les vues sont importées statiquement, leur CSS est chargé globalement dans le bundle.
- Routes : `/admin/:tab?` (nom `admin`, sans session active), `/admin/session/:code/:tab?` (nom `admin-session`, session active — `:code` n'est jamais optionnel ici, contrairement à `:tab?` : un `/admin/:code?/:tab?` unique serait ambigu au matching, un segment comme `spells` pourrait être capturé comme `code` plutôt que `tab`), `/view/:code/:tab?` (nom `player-view`), `/player/:tab?` (nom `player-self`), `/tv/:code`.
- **Ne jamais construire une URL/route `/admin/...` à la main.** Utiliser `adminTabRoute(tab, query?)` (`utils/adminRoute.js`) pour naviguer vers un onglet admin, et `contentBasePath(route)` (`utils/contentRoutes.js`) pour les liens internes vers le contenu (RefLink, clics délégués) — ces helpers choisissent `admin` vs `admin-session` selon `sessionStore.activeSession`.
- Dans un `FormData` d'upload avatar : appender `sessionCode` **avant** le champ `file` — multer résout le tenant dans `destination()` au moment où le flux arrive.
- Onglets "Contenu" (Sorts/Objets/Races/Classes/Origines/Aptitudes) sont accessibles **sans session active** — ne pas y lire l'état de session. L'onglet `admins` (`AdminAccountsManager.vue`, domaine `outils`) suit la même règle — indépendant de toute session — mais est en plus conditionné à `authStore.admin?.is_owner` : `NAV_GROUPS_FULL` (`AdminView.vue`) ne le pose dans `ACCOUNT_TABS` que pour le propriétaire, absent du menu (pas grisé) pour les autres admins. **Apparaître dans le menu sans session ne suffit pas** : `SESSIONLESS_TABS` (= `CONTENT_TABS` ∪ `ACCOUNT_TABS`) et `isSessionlessTab` pilotent aussi le rendu du panneau principal (`v-else-if="sessionStore.activeSession || isSessionlessTab"`) et le nettoyage de l'URL en quittant une session — un onglet ajouté seulement à `CONTENT_TABS`/`ACCOUNT_TABS` sans être dans un groupe de `NAV_GROUPS_FULL` (ou l'inverse) reste accessible par URL directe mais absent du menu, ou cliquable mais affichant le placeholder « Sélectionnez ou créez une session » à la place de son contenu.
- **Thèmes et densité.** 4 thèmes : `dark` · `sceau` · `arcane` · `nacre` (`light` a été supprimé ; une préférence stockée est remappée vers `sceau` par `RETIRED_THEMES` dans `themePreferences.js` — jamais vers `dark`, qui ferait passer d'un fond clair à un quasi-noir). La densité (`compact` / `confortable`) vit dans `data-density` sur `<html>`, en parallèle de `data-theme`, et partage la clé `cf_theme_preferences` sous des entrées préfixées `density:<scope>`. Le choix se fait via `ThemePicker.vue` / `DensityToggle.vue` (sélecteurs explicites), jamais un bouton de cycle.
- **Échelles CSS : `styles/tokens.derive.css` (L1) uniquement.** Espacement (`--space-*`), typographie (`--text-*`, plancher `--text-sm` = 13 px ; `--text-2xs` = 11 px réservé aux méta non critiques, jamais un libellé de navigation), rayons (`--radius-*`), mouvement (`--dur-*`, `--ease-out`), `--touch-min`, `--focus-ring-*`, `--z-*`. Ces valeurs ne varient **jamais** par thème : les blocs `:root[data-theme=…]` de `style.css` ne redéfinissent que des couleurs. Ajouter une échelle = une seule édition dans `tokens.derive.css`.
- **`!important` dans `style.css`** : il n'en reste qu'un bloc, sur `.form-input` / `.form-select` / `.form-textarea` / `.recipient-select`. Il force `--surface-raised` (translucide) là où les règles scoped des composants veulent `--color-surface` (opaque) — le retirer bascule l'apparence de tous les champs de l'application d'un coup, c'est une décision visuelle, pas un nettoyage. Le faire composant par composant. Les autres blocs ont été retirés : ne pas réintroduire un `!important` global pour contourner une règle scoped, corriger la règle scoped.
- Texte posé sur un scrim noir (overlays TV) : utiliser `--color-overlay-text` / `--color-overlay-danger-text`, jamais `--color-info-bright` ni `--color-danger` directement — ces derniers sont sombres sur les thèmes clairs et deviennent illisibles.
- **Anneau de focus : une seule règle globale `:focus-visible` dans `style.css`**, alimentée par `--focus-ring-width` / `--focus-ring-offset` / `--focus-ring-color` (L1). Elle est écrite en `outline`, **jamais en `box-shadow`** : un box-shadow est rogné par le premier ancêtre en `overflow: hidden`, et la quasi-totalité des listes de l'app en sont. Un composant qui veut son propre anneau (HelpTip, RefLink) déclare `.sa-classe:focus-visible` — un sélecteur de classe passe naturellement devant la règle globale, aucun `!important` n'est nécessaire.
- **Corollaire : ne pas écrire `outline: none` dans l'état de base d'un champ.** 27 sélecteurs le font encore (champs de recherche des 9 onglets contenu, `.form-input` de HomeView/PlayerJoinView, composeurs de message, `.notes-textarea`…) : posé hors de `:focus`, à spécificité de classe, il neutralise la règle globale et laisse ces éléments **sans aucune indication de focus** au clavier, remplacée au mieux par un changement de `border-color` de 1 px. Pour tuer l'anneau du navigateur, viser `:focus { outline: none }` et fournir un substitut visible, ou ne rien écrire du tout et laisser la règle globale faire son travail.
- **Régions `aria-live` : le conteneur doit être monté en permanence.** Les deux piles de toasts (`PlayerRollToasts.vue` côté MJ, `.toast-stack` de `PlayerInboxView.vue` côté joueur) portent `role="status" aria-live="polite"` sur le `<TransitionGroup tag="div">` — les attributs traversent bien jusqu'à l'élément rendu. Ne jamais mettre de `v-if` sur ces conteneurs ni les créer avec le premier toast : une région live insérée en même temps que son contenu **n'annonce rien**, en silence et sans erreur. C'est pour cette raison que la bannière `MerchantRequestsBanner` (en `v-if`) n'en porte pas.
- **Navigation admin : rail à 7 domaines** (`AdminNavSidebar.vue`, constante `DOMAINS`) — `Table` · `Scène` · `Rythme` · `Interactions` · `Économie` · `Grimoire` · `Outils`. C'est un **regroupement de présentation** au-dessus des 24 clés d'onglet : aucune clé n'est renommée ni fusionnée, aucune route n'est créée, les `data-testid="tab-<key>"` sont préservés. Ajouter un onglet = l'ajouter à `tabs` (AdminView) **et** dans le domaine voulu de `DOMAINS`, sinon il n'apparaît nulle part.
- **Barre de scène** (`AdminSceneBar.vue`) : remplace l'ancienne colonne droite `AdminTvSidebar` (supprimée), qui disparaissait sous 1100 px. Le sélecteur de mode TV est un popover en **`v-show`, pas `v-if`** — plusieurs specs e2e (`19-map`, `14-tv-modes`) vérifient l'état `enabled`/`active` d'un `tv-mode-btn-<key>` sans ouvrir le sélecteur, les boutons doivent donc rester dans le DOM. Côté e2e, `AdminPage.setTvMode()` ouvre le popover avant de cliquer.
- **Pastille d'activité de la nav (`tabActivity`) vs `ready` des modes TV (`tvModes[]`) : deux concepts distincts, ne pas les confondre.** `ready` répond « y a-t-il un contenu disponible pour ce mode » (persiste tant que le contenu existe : un marchand créé, une carte chargée, des factions saisies). La pastille répond « ce mode est-il diffusé sur la TV **en ce moment** » (`tvMode === '<clé>'`). Pour `map` et `reputation`, une carte ou des factions ne « ferment » jamais au sens où un vote se ferme — `hasActiveMap`/`hasActiveReputation` alimentent donc `ready` mais pas la pastille, qui dérive séparément de `tvMode.value`. `merchant` fait exception : `hasActiveMerchant` sert aux deux, car le serveur ne le pose vrai que si `tv_mode === 'merchant'` (`session.current_merchant_id && session.tv_mode === 'merchant'`, voir `getActiveMerchantAndPuzzle` dans `backend/src/socket.js`) — les événements socket génériques (`set-tv-mode`, une simple édition d'objets via `merchant-items-updated`) n'incluent jamais de `merchantData`, donc **toujours** dériver l'état marchand de `payload.mode`, jamais de la présence d'une clé dans le payload : un `!== undefined` sur une clé absente ne se déclenche tout simplement jamais, et l'ancien bug laissait le marchand « actif » indéfiniment après fermeture — y compris sélectionnable depuis le mode générique sans `current_merchant_id`, ce qui affichait une TV vide (aucune branche `v-else-if` de `TvView.vue` ne correspondait).
- L'indicateur « Diffusé sur la TV » affiche, en mode `content`, le **nom de la fiche** projetée suivi de son type entre parenthèses (`Boule de feu (Sort)`) — d'où `activeContent` (objet `{ contentType, contentData }`) et non un booléen dans `AdminView.vue`, et la table `CONTENT_TYPE_LABELS` qui distingue `Objet` / `Objet magique` via `source_category`. Les autres modes n'ont pas de détail.
- **Navigation joueur : source unique** (`components/player/PlayerNav.vue`), rendue **une seule fois** — rail latéral ≥ 1024 px, barre basse en dessous, le placement étant piloté par `order` (PlayerNav `order: 2` / `.inbox-main` `order: 1`, inversés à 1024 px). Auparavant deux blocs dupliqués portaient les mêmes `data-testid="player-tab-<key>"`, d'où les `.filter({ visible: true })` encore présents dans plusieurs specs — inoffensifs sur un nœud unique. Les classes `tab-icon`, `tab-icon-notify`, `tab-badge`, `tab-badge-urgent`, `tab-badge-pulse` sont **ciblées telles quelles** par `09-messages`, `12-votes` et `13-merchant` : ne pas les renommer.
- Les entrées **Boutique / Vote / Puzzle** ne sont rendues que si la chose correspondante est diffusée (`activeMerchant` / `activeVote` / `activePuzzle`). C'est un contrat e2e : `13-merchant` vérifie l'**absence** de `player-tab-boutique` hors marchand actif — une entrée toujours présente ferait échouer l'assertion en mode strict.
- **Grimoire joueur** (`components/player/PlayerGrimoireIndex.vue`) : les familles de contenu ne sont plus des entrées de navigation mais un écran d'index sous la clé `grimoire`. Chaque famille **garde sa clé d'onglet et son URL** (`/player/spells`…) — aucune route ajoutée, `useContentTabQuery()` inchangé. L'entrée « Grimoire » reste surlignée pendant la consultation d'une famille (`activeNavKey`). En mode démo l'entrée est masquée **et** `grimoire` est renvoyé vers `combat`, l'URL restant atteignable directement. Côté e2e, `PlayerPage.switchTab()` fait le saut par l'index pour ces clés. **`magic` est volontairement absent** de l'index (et de `CONTENT_TABS` dans `PlayerInboxView.vue`, et de la recherche globale `PlayerCommandPalette.vue`) : la fiche d'un objet magique révèle sa rareté et son effet, ce qui spoile la surprise avant que le joueur ne l'obtienne — même raison que la description masquée dans `PlayerMerchantTab.vue`. Les joueurs ne découvrent un objet magique que via la boutique (sans description) ou une projection TV du MJ. Côté admin, `magic` reste un onglet `CONTENT_TABS`/`ItemSearch` normal — la restriction est joueur uniquement.
- **Projection d'une fiche de contenu sur la TV (`show-content`)** : les 7 types acceptés sont `spell`, `item` (équipement ET objet magique confondus), `race`, `background`, `ability`, `service`, `condition` — liste `CONTENT_TYPES` dans `backend/src/socket.js`, qui rejette silencieusement tout autre type. **Une classe n'est jamais projetée** (fiche trop longue pour l'écran) : `ClassSearch.vue` n'affiche pas `ContentActionButtons`, et `classPreview()` dans `CommandPalette.vue` omet volontairement `contentType`. Deux surfaces émettent cet événement — `ContentActionButtons.vue` (fiche dans un onglet) et `CommandPalette.vue` (résultat de recherche Ctrl+K) ; les deux envoient l'objet brut déjà chargé côté client, le serveur ne le résout jamais lui-même. Dans la palette, `canShowOnTv()` teste la présence de `contentType` : ajouter un type de contenu = le poser dans le `*Preview()` correspondant, rien d'autre.

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
| `VITE_BACKEND_URL` | frontend | URL backend (Socket.IO + fetch) — lue **au build** par Vite (`import.meta.env`). Sans override, `npm run build`/`docker build` charge `frontend/.env.production` (pointe vers la prod). Pour un `docker-compose.yml` qui buildera l'image une seule fois, passer la valeur voulue via `build:.args:` (voir `e2e/docker-compose.test.yml`), pas via `environment:` — un `environment:` sur le service frontend n'a aucun effet sur du JS déjà buildé. |
| `BACKEND_URL` | frontend (runtime) | Alternative à `VITE_BACKEND_URL` qui ne nécessite pas de rebuild : lue **au démarrage du container** par `docker-entrypoint.sh`, qui écrit `window.BACKEND_URL` dans `config.js` — `frontend/src/config.js` la préfère à `VITE_BACKEND_URL`. Accepte un hostname seul (préfixé `https://`, cas Render) ou une URL complète (cas docker-compose). C'est le mécanisme à utiliser dans `docker-compose.yml` (sous `environment:`, pas `build:.args:`). |
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