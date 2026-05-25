# DM Toolkit — Outil de gestion de sessions D&D 5e

Application web temps réel pour le Maître du Jeu, permettant de gérer des sessions de jeu de rôle D&D 5e en français. Conçue pour fonctionner avec un écran TV dédié (vue spectateur) et les appareils des joueurs.

## Déploiement en un clic

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/KyneSilverhide/dmtoolkit)

Déploie automatiquement le backend, le frontend et une base de données PostgreSQL sur [Render](https://render.com). Après le déploiement :

1. Dans le dashboard Render, noter les URLs publiques des deux services (visibles dans l'onglet **Settings** de chaque service)
2. Service **dmtoolkit-backend** > **Environment** : remplacer `FRONTEND_URL` par l'URL du frontend, puis redémarrer le backend
3. Service **dmtoolkit-frontend** > **Environment** : remplacer `BACKEND_URL` par l'URL du backend, puis redémarrer le frontend
4. *(Optionnel)* Dans le backend, renseigner `GITHUB_TOKEN` avec un token GitHub classic (aucun scope requis) pour activer le générateur IA
5. Récupérer le mot de passe admin dans la variable `ADMIN_DEFAULT_PASSWORD` du backend

> **Tier gratuit** : les services se mettent en veille après 15 minutes d'inactivité (réveil en ~30 secondes). Passer en plan **Starter** ($7/mois par service) pour éviter la mise en veille lors des sessions de jeu.

## Fonctionnalités

- **Gestion des joueurs** : PV, CA, classe, avatar, conditions, concentration, initiative
- **Écran TV** : affichage dédié avec plusieurs modes (lobby, image, map, vote, marchand, doom clock, échelle de tension, timer, round de combat)
- **Battlemap interactive** : brouillard de guerre, tokens de joueurs, contrôle du viewport
- **Messagerie** : envoi de messages et résultats de jets de dés aux joueurs
- **Système de vote** : votes anonymes ou publics avec fermeture automatique
- **Marchand** : boutique interactive avec panier, stock et négociation de prix
- **Sorts** : recherche parmi 477 sorts D&D 5e en français
- **Équipement** : recherche d'objets standard (147) et magiques D&D 5e
- **Générateur IA** : génération de noms de PNJ, lieux, auberges, accroches de quêtes et descriptions via GitHub Models (gpt-4o-mini)
- **Multi-tenant** : isolation complète des sessions et des fichiers uploadés par administrateur
- **Compte démo** : compte `demo` (mot de passe `demo`) disponible par défaut ; son contenu est effacé et réinitialisé automatiquement chaque nuit à minuit — un bandeau d'avertissement est affiché dans toutes les interfaces
- **Plugin Obsidian** : synchronisation bidirectionnelle avec l'Initiative Tracker d'Obsidian

## Architecture

```
/
├── frontend/          # Vue 3 + Vite + Pinia (port 5173)
├── backend/           # Node.js + Express + Socket.IO (port 3000)
│   └── src/
│       ├── index.js       # Point d'entrée (Express + Socket.IO)
│       ├── socket.js      # Handlers temps réel
│       ├── migrations.js  # Migrations PostgreSQL (auto au démarrage)
│       ├── data/          # Données statiques (sorts, objets)
│       └── routes/        # REST API (auth, sessions, uploads, spells, magic-items, equipment, generate)
├── obsidian-plugin/   # Plugin Obsidian — sync Initiative Tracker
└── docker-compose.yml     # PostgreSQL 16 + backend + frontend
```

## Lancement avec Docker

```bash
# Copier et adapter les variables d'environnement
cp .env.example .env   # si disponible, sinon voir docker-compose.yml

# Démarrer tous les services
docker compose up --build
```

L'application est accessible sur :
- Frontend : http://localhost:5173
- Backend API : http://localhost:3000

Identifiants admin par défaut : `admin` / (défini dans l'env `ADMIN_PASSWORD` ou généré au démarrage)

## Développement local (sans Docker)

**Prérequis** : Node.js 20+, PostgreSQL 16

```bash
# Backend
cd backend
npm install
# Configurer DATABASE_URL, JWT_SECRET, PORT, FRONTEND_URL dans .env
npm run dev

# Frontend (autre terminal)
cd frontend
npm install
# Configurer VITE_BACKEND_URL dans .env
npm run dev
```

## Tests et validation

```bash
# Tests unitaires frontend (Vitest)
cd frontend && npm test

# Build frontend
cd frontend && npm run build

# Vérification syntaxique backend
cd backend && node --check src/index.js src/socket.js src/routes/spells.js src/routes/sessions.js src/routes/equipment.js src/migrations.js
```

## Variables d'environnement

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | backend | URL PostgreSQL (ex. `postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` | backend | Clé secrète pour les tokens JWT (obligatoire en prod) |
| `PORT` | backend | Port Express (défaut : 3000) |
| `FRONTEND_URL` | backend | URL du frontend pour CORS et QR codes |
| `VITE_BACKEND_URL` | frontend | URL du backend pour le client Socket.IO |
| `GITHUB_TOKEN` | backend | Token GitHub (classic, aucun scope requis) pour le générateur IA via GitHub Models |
| `DEMO_ENABLED` | backend | Désactiver le compte démo en mettant `false` (défaut : `true`) |
| `DEMO_PASSWORD` | backend | Mot de passe du compte `demo` (défaut : `demo`) |
| `DEMO_FORCE_RESEED` | backend | Forcer un clean + re-seed du contenu démo au démarrage en mettant `true` (défaut : `false`) |
| `DEMO_RESET_ENABLED` | backend | Désactiver le reset nocturne automatique en mettant `false` (défaut : `true`) |
| `DEMO_SEED_ENABLED` | backend | Désactiver le seed initial du contenu démo en mettant `false` (défaut : `true`) |

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vue 3 (`<script setup>`), Vite, Pinia, Vue Router 4 |
| Tests | Vitest |
| Backend | Node.js 20, Express 4 |
| Temps réel | Socket.IO 4.8 |
| Base de données | PostgreSQL 16 |
| Auth | JWT + bcrypt |
| Conteneurisation | Docker + Docker Compose |
