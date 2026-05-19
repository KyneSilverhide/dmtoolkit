# Plan : Compte démo avec reset nocturne et bannières

Créer un compte `demo` persistant par défaut, dont tout le contenu est effacé et recrée chaque nuit à minuit. Un bandeau d'avertissement visible est affiché dans les trois interfaces (MJ, TV, joueur).

## Étapes

### 1. Migration DB

Dans `backend/src/migrations.js`, ajouter à la fin du bloc de migrations :

```sql
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;
```

### 2. Seed du compte démo

Dans `backend/src/index.js`, ajouter une fonction `seedDemoAdmin()` appelée dans `start()` après `seedAdmin()` :

- Insère ou met à jour le compte `demo` avec `is_demo = true`
- Mot de passe configurable via `DEMO_PASSWORD` (défaut : `demo`) via `bcrypt`
- La création du JWT dans `routes/auth.js` doit inclure `is_demo` dans le payload

```js
const token = jwt.sign(
  { id: admin.id, username: admin.username, is_demo: admin.is_demo },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
)
```

La réponse de login et `/me` doivent retourner `is_demo` dans l'objet `admin`.

### 3. Nouveau fichier `backend/src/demo.js`

Fichier CommonJS pur, exportant trois fonctions :

#### `seedDemoContent(demoAdminId)`

Crée le contenu de démo de base pour le compte démo :

- 1 session nommée "Campagne de démonstration" avec code `0000`, `status = 'active'`, `created_by = demoAdminId`
- 1 marchand "Elara la Marchande" lié à cette session, `description = "Une elfe aux yeux d'ambre, spécialisée en potions et équipements d'aventuriers."`
- Articles du marchand :
  - Potion de soins (catégorie : Potions, prix : 50, stock : 10)
  - Potion de soins supérieure (catégorie : Potions, prix : 150, stock : 5)
  - Antidote (catégorie : Potions, prix : 50, stock : 5)
  - Torche (catégorie : Équipement, prix : 1, stock : -1)
  - Corde de chanvre (catégorie : Équipement, prix : 1, stock : -1)
  - Rations de voyage (catégorie : Équipement, prix : 5, stock : -1)
  - Parchemin de Soin des Blessures (catégorie : Parchemins, prix : 75, stock : 3)

#### `resetDemoContent(demoAdminId)`

1. Supprime toutes les sessions du compte démo et leurs données liées en cascade :
   - `DELETE FROM sessions WHERE created_by = $1` (avec suppression en cascade des players, messages, votes, merchants, etc. — ou explicitement dans l'ordre des FK)
2. Supprime les fichiers uploadés du dossier `uploads/<demoAdminId>/` via `fs.rm(..., { recursive: true, force: true })`
3. Appelle `seedDemoContent(demoAdminId)`

#### `scheduleDemoReset(demoAdminId)`

Calcule les millisecondes jusqu'au prochain minuit (heure locale serveur), puis :

```js
const msUntilMidnight = ...
setTimeout(() => {
  resetDemoContent(demoAdminId)
  setInterval(() => resetDemoContent(demoAdminId), 24 * 60 * 60 * 1000)
}, msUntilMidnight)
```

Aucune dépendance externe (pas de `node-cron`).

#### Intégration dans `index.js`

```js
const { seedDemoContent, scheduleDemoReset } = require('./demo')

async function start() {
  // ...migrations, seedAdmin, seedDemoAdmin...
  const demoAdmin = await pool.query("SELECT id FROM admins WHERE username = 'demo' AND is_demo = TRUE")
  if (demoAdmin.rows[0]) {
    const demoAdminId = demoAdmin.rows[0].id
    await seedDemoContent(demoAdminId)  // s'assure que le contenu existe au démarrage
    scheduleDemoReset(demoAdminId)
  }
  // ...server.listen...
}
```

> `seedDemoContent` doit être idempotente : vérifier si la session `0000` existe déjà avant de créer.

### 4. Propagation du flag `is_demo` dans Socket.IO

Dans `backend/src/socket.js`, enrichir les événements suivants :

#### `session-joined`

Lors du `JOIN sessions WHERE code = $1`, joindre la table `admins` pour récupérer `is_demo` :

```sql
SELECT s.*, a.is_demo as admin_is_demo
FROM sessions s
JOIN admins a ON a.id = s.created_by
WHERE s.code = $1 AND s.status = 'active'
```

Ajouter `isDemo: !!session.admin_is_demo` dans le payload `session-joined` :

```js
socket.emit('session-joined', {
  session: { id: session.id, name: session.name, code: session.code },
  player: { ... },
  activeMerchant: ...,
  isDemo: !!session.admin_is_demo,
})
```

#### `tv-snapshot`

Même jointure dans le handler `tv-join`. Ajouter `isDemo: !!session.admin_is_demo` au payload.

#### `admin-state` (dans `admin-join`)

`socket.admin` vient du middleware JWT — ajouter `is_demo` au payload JWT à l'étape 2. Donc `socket.admin.is_demo` est disponible sans requête supplémentaire. Ajouter au payload :

```js
socket.emit('admin-state', {
  ...
  isDemo: !!socket.admin.is_demo,
})
```

#### Middleware socket existant

Vérifier que le middleware d'authentification propage correctement `is_demo` depuis le JWT vers `socket.admin`.

### 5. Bannières frontend

#### Nouveau composant `frontend/src/components/DemoBanner.vue`

```vue
<template>
  <div class="demo-banner">
    ⚠️ Mode démonstration — Le contenu de ce compte est effacé automatiquement chaque nuit à minuit.
  </div>
</template>
```

Style : fond ambre/orange, texte sombre, `position: sticky; top: 0; z-index: 1000;`, `font-size: 0.85rem`.

#### `AdminView.vue`

- Importer `DemoBanner`
- Condition : `authStore.admin?.is_demo === true`
- Placement : tout en haut du template, avant le header, ou comme première ligne dans la layout

#### `TvView.vue`

- Récupérer `isDemo` depuis le payload `tv-snapshot`
- Stocker dans `const isDemo = ref(false)` et setter dans le handler `tv-snapshot`
- Style minimal pour ne pas gêner la vue spectateur : bandeau très fin, semi-transparent, en bas de l'écran

#### `PlayerInboxView.vue`

- Récupérer `isDemo` depuis le payload `session-joined`
- Stocker dans `const isDemo = ref(false)`
- Bandeau en haut de l'interface joueur

#### `PlayerJoinView.vue`

- Pas de bannière (le joueur n'a pas encore rejoint, on ne sait pas si c'est une session démo)
- Optionnel : si le code saisi est `0000`, afficher une note "Ce code correspond à la session de démonstration."

## Considérations

### Reset des fichiers uploadés

Le reset supprime les lignes DB **et** les fichiers dans `uploads/<demoAdminId>/` via `fs.rm`. Le dossier sera recréé si un fichier est uploadé ensuite.

### Connexions actives pendant le reset

Si des sockets sont connectés à minuit pendant le reset :
- Les données DB sont supprimées et recréées
- Les clients verront un état incohérent à la prochaine interaction
- Solution minimale acceptable : ne pas notifier activement (les clients verront juste un état vide ou un rechargement forcera la resynchronisation)
- Solution plus robuste (optionnelle) : émettre un événement `demo-reset` aux rooms `session:*` et `admin:*` et `tv:*` du compte démo pour forcer un `window.location.reload()` côté client

### Idempotence de `seedDemoContent`

La fonction vérifie si une session avec `code = '0000'` et `created_by = demoAdminId` existe déjà avant d'insérer quoi que ce soit. Si oui, elle ne fait rien.

### Code de session `0000`

Le code `0000` n'est jamais généré par la logique normale (qui génère entre 1000 et 9999). Il est réservé au compte démo. Ajouter un commentaire dans `migrations.js` et dans `demo.js` pour documenter cette convention.

### Variable d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `DEMO_PASSWORD` | Mot de passe du compte démo | `demo` |

À documenter dans `README.md` et `CLAUDE.md`.

## Fichiers à modifier

| Fichier | Changement |
|---|---|
| `backend/src/migrations.js` | Ajouter `ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;` |
| `backend/src/index.js` | Ajouter `seedDemoAdmin()`, appels à `seedDemoContent` et `scheduleDemoReset` |
| `backend/src/routes/auth.js` | Retourner `is_demo` dans login et `/me`, inclure dans JWT |
| `backend/src/socket.js` | Ajouter `isDemo` dans `session-joined`, `tv-snapshot`, `admin-state` |
| `backend/src/demo.js` | **Nouveau fichier** — seed + reset + scheduler |
| `frontend/src/components/DemoBanner.vue` | **Nouveau composant** |
| `frontend/src/views/AdminView.vue` | Intégrer `DemoBanner` si `is_demo` |
| `frontend/src/views/TvView.vue` | Intégrer `DemoBanner` si `isDemo` |
| `frontend/src/views/PlayerInboxView.vue` | Intégrer `DemoBanner` si `isDemo` |
| `frontend/src/views/PlayerJoinView.vue` | Optionnel : note si code = `0000` |
| `CLAUDE.md` | Documenter `DEMO_PASSWORD`, compte démo, convention code `0000` |
| `README.md` | Mentionner le compte démo et la variable d'environnement |

