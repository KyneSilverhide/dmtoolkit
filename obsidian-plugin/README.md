# Critical Fail Sync — Plugin Obsidian

Plugin Obsidian qui synchronise le plugin **Initiative Tracker** avec l'application **Critical Fail** (gestionnaire de sessions D&D 5e).

## Fonctionnalités

| Direction | Ce qui est synchronisé |
|---|---|
| Critical Fail → Obsidian | Joueurs (nom, PV, CA, initiative) injectés dans l'Initiative Tracker au démarrage |
| Obsidian → Critical Fail | Changements d'initiative et de PV dans l'IT propagés vers l'écran admin/TV |

## Installation

### 1. Prérequis

- [Obsidian](https://obsidian.md/) ≥ 1.4.0
- Plugin [Initiative Tracker](https://github.com/javalent/initiative-tracker) installé et activé
- Backend Critical Fail accessible (local ou serveur)

### 2. Build

```bash
cd obsidian-plugin
npm install
npm run build
```

### 3. Copier dans le vault

```bash
# Remplace <vault> par le chemin de ton vault Obsidian
cp main.js manifest.json <vault>/.obsidian/plugins/critical-fail-sync/
```

### 4. Activer dans Obsidian

Paramètres → Plugins communautaires → activer **Critical Fail Sync**.

## Configuration

Dans les paramètres du plugin :

| Champ | Description |
|---|---|
| **URL du backend** | URL de ton backend CF, ex. `http://localhost:3000` |
| **Token JWT admin** | Copie-le depuis le localStorage de l'interface admin CF (clé `token`) |
| **ID de session** | L'ID numérique de la session active (visible dans l'URL de l'admin) |
| **Connexion automatique** | Se connecter au démarrage d'Obsidian |

## Récupérer le token JWT

1. Ouvre l'interface admin Critical Fail dans ton navigateur
2. Ouvre les DevTools (F12) → Application → Local Storage
3. Copie la valeur de la clé `token`
4. Colle-la dans les paramètres du plugin

## Commandes disponibles

| Commande | Action |
|---|---|
| `Critical Fail: Connecter` | Établit la connexion Socket.IO |
| `Critical Fail: Déconnecter` | Ferme la connexion |
| `Critical Fail: Synchroniser les joueurs CF → IT` | Import REST des joueurs courants |

## Architecture technique

```
Obsidian Initiative Tracker
        ↕  API interne (app.plugins.plugins['initiative-tracker'])
critical-fail-sync (ce plugin)
        ↕  Socket.IO + JWT (events: admin-join, obsidian-sync-initiatives, admin-update-hp)
Critical Fail Backend (Node.js + Socket.IO)
```

### Événements Socket.IO utilisés

**Reçus depuis CF :**
- `players-snapshot` — liste initiale des joueurs
- `player-joined` / `player-left` — arrivée/départ d'un joueur
- `hp-updated` / `initiative-updated` — mises à jour individuelles

**Envoyés vers CF :**
- `obsidian-sync-initiatives` — `{ sessionId, updates: [{playerName, initiative}] }`
- `admin-update-hp` — `{ sessionId, playerName, currentHp }`

## Limitations connues

- Le matching joueur IT ↔ CF se fait **par nom** (insensible à la casse). Les noms doivent correspondre exactement.
- L'event `player-left` ne peut pas identifier le joueur partant par son ID (l'IT ne stocke pas les IDs CF) — suppression manuelle nécessaire dans ce cas.
- L'API interne de l'Initiative Tracker n'est pas documentée officiellement et peut changer entre versions.
