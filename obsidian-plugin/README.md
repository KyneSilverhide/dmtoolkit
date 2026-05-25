# DM Toolkit Sync — Plugin Obsidian

Plugin Obsidian qui synchronise le plugin **Initiative Tracker** avec l'application **DM Toolkit** (gestionnaire de sessions D&D 5e).

## Fonctionnalités

| Direction | Ce qui est synchronisé |
|---|---|
| DM Toolkit → Obsidian | Joueurs (nom, PV, CA, initiative) injectés dans l'Initiative Tracker au démarrage |
| Obsidian → DM Toolkit | Changements d'initiative et de PV dans l'IT propagés vers l'écran admin/TV |

## Installation

### 1. Prérequis

- [Obsidian](https://obsidian.md/) ≥ 1.4.0
- Plugin [Initiative Tracker](https://github.com/javalent/initiative-tracker) installé et activé
- Backend DM Toolkit accessible (local ou serveur)

### 2. Build

```bash
cd obsidian-plugin
npm install
npm run build
```

### 3. Copier dans le vault

```bash
# Remplace <vault> par le chemin de ton vault Obsidian
cp main.js manifest.json <vault>/.obsidian/plugins/dmtoolkit-sync/
```

### 4. Activer dans Obsidian

Paramètres → Plugins communautaires → activer **DM Toolkit Sync**.

## Configuration

Dans les paramètres du plugin :

| Champ | Description |
|---|---|
| **URL du backend** | URL de ton backend DM Toolkit, ex. `http://localhost:3000` |
| **Token JWT admin** | Copie-le depuis le localStorage de l'interface admin (clé `token`) |
| **ID de session** | L'ID numérique de la session active (visible dans l'URL de l'admin) |
| **Connexion automatique** | Se connecter au démarrage d'Obsidian |

## Récupérer le token JWT

1. Ouvre l'interface admin DM Toolkit dans ton navigateur
2. Ouvre les DevTools (F12) → Application → Local Storage
3. Copie la valeur de la clé `token`
4. Colle-la dans les paramètres du plugin

## Commandes disponibles

| Commande | Action |
|---|---|
| `DM Toolkit: Connecter` | Établit la connexion Socket.IO |
| `DM Toolkit: Déconnecter` | Ferme la connexion |
| `DM Toolkit: Synchroniser les joueurs CF → IT` | Import REST des joueurs courants |

## Architecture technique

```
Obsidian Initiative Tracker
        ↕  API interne (app.plugins.plugins['initiative-tracker'])
dmtoolkit-sync (ce plugin)
        ↕  Socket.IO + JWT (events: admin-join, obsidian-sync-initiatives, admin-update-hp)
DM Toolkit Backend (Node.js + Socket.IO)
```

### Événements Socket.IO utilisés

**Reçus depuis DM Toolkit :**
- `players-snapshot` — liste initiale des joueurs
- `player-joined` / `player-left` — arrivée/départ d'un joueur
- `hp-updated` / `initiative-updated` — mises à jour individuelles

**Envoyés vers DM Toolkit :**
- `obsidian-sync-initiatives` — `{ sessionId, updates: [{playerName, initiative}] }`
- `admin-update-hp` — `{ sessionId, playerName, currentHp }`

## Limitations connues

- Le matching joueur IT ↔ DM Toolkit se fait **par nom** (insensible à la casse). Les noms doivent correspondre exactement.
- L'event `player-left` ne peut pas identifier le joueur partant par son ID (l'IT ne stocke pas les IDs) — suppression manuelle nécessaire dans ce cas.
- L'API interne de l'Initiative Tracker n'est pas documentée officiellement et peut changer entre versions.
