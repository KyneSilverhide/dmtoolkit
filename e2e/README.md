# Tests End-to-End — Critical Fail

Tests Playwright couvrant les 22 fonctionnalités principales de l'application (auth, joueurs, HP, dés, votes, marchand, battlemap, etc.).

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 20 |
| Docker + Docker Compose | récent |
| Playwright (navigateurs) | installé via `npx playwright install` |

---

## Architecture

```
e2e/
├── specs/               # Tests (01-auth → 22-theme)
├── fixtures/
│   ├── db.ts            # resetDb() — remet la DB à zéro entre les suites
│   └── index.ts         # Fixtures Playwright (adminToken, sessionCode)
├── helpers/
│   ├── auth.ts          # getAdminToken(), loginAsAdmin()
│   ├── session.ts       # createSession(), deleteSession()
│   └── player.ts        # Utilitaires joueur
├── page-objects/        # AdminPage, PlayerPage, TvPage
├── global-setup.ts      # Réinitialisation DB + vérification backend au démarrage
├── playwright.config.ts # Config Playwright
└── docker-compose.test.yml  # Surcharge Docker pour la DB de test
```

Les tests s'exécutent **en série** (`workers: 1`). Chaque spec réinitialise la base via `resetDb()` dans son `beforeEach`.

---

## Lancer les tests en local

### Étape 1 — Démarrer le backend et la base de test

Depuis la **racine du dépôt** :

```bash
docker compose -f docker-compose.yml -f e2e/docker-compose.test.yml up -d postgres backend
```

Attendre que le backend réponde :

```bash
# PowerShell
do { Start-Sleep 2 } until (try { (Invoke-WebRequest http://localhost:3000/api/health -UseBasicParsing).StatusCode -eq 200 } catch { $false })

# Bash
until curl -sf http://localhost:3000/api/health; do sleep 2; done
```

### Étape 2 — Démarrer le frontend (dev server)

Dans un terminal séparé, depuis la racine :

```bash
cd frontend && npm install && npm run dev
```

Le frontend doit écouter sur `http://localhost:5173`.

### Étape 3 — Installer les dépendances e2e et les navigateurs

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
```

### Étape 4 — Lancer les tests

```bash
cd e2e
npm test
```

### Étape 5 — Teardown

```bash
# Depuis la racine
docker compose -f docker-compose.yml -f e2e/docker-compose.test.yml down -v
```

---

## Variables d'environnement

| Variable | Défaut                                                                    | Description |
|---|---------------------------------------------------------------------------|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:5173`                                                   | URL du frontend |
| `BACKEND_URL` | `http://localhost:3000`                                                   | URL du backend |
| `DATABASE_URL` | `postgresql://criticalfail:criticalfail@localhost:5432/criticalfail_test` | DB de test |
| `ADMIN_DEFAULT_USERNAME` | `admin`                                                                   | Login admin |
| `ADMIN_DEFAULT_PASSWORD` | `admin`                                                                   | Mot de passe admin |

Surcharger via un fichier `.env` dans `e2e/` ou en les posant avant la commande :

```bash
# PowerShell
$env:ADMIN_DEFAULT_PASSWORD = "MonMotDePasse"; npm test

# Bash
ADMIN_DEFAULT_PASSWORD=MonMotDePasse npm test
```

---

## Commandes disponibles

| Commande | Description |
|---|---|
| `npm test` | Lance tous les tests en mode headless |
| `npm run test:headed` | Lance les tests avec le navigateur visible |
| `npm run test:ui` | Ouvre l'interface graphique Playwright (debug interactif) |
| `npm run report` | Affiche le rapport HTML du dernier run |

### Lancer un seul fichier de spec

```bash
npx playwright test specs/01-auth.spec.ts
npx playwright test specs/13-merchant.spec.ts
```

### Lancer un test par nom

```bash
npx playwright test -g "successful login redirects"
```

---

## Déboguer un test

```bash
# Ouvre l'UI Playwright avec timeline, traces et snapshots DOM
npm run test:ui

# Mode headed + pause au premier expect qui échoue
npx playwright test --headed --debug specs/04-hp-sync.spec.ts
```

En cas d'échec, les traces et vidéos sont conservées dans `e2e/test-results/`. Pour les consulter :

```bash
npx playwright show-trace test-results/<nom-du-test>/trace.zip
```

---

## En CI (GitHub Actions)

Le workflow `.github/workflows/deploy.yml` démarre automatiquement le stack de test, lance les specs, et bloque le déploiement en cas d'échec. Les traces sont uploadées comme artefact (`playwright-traces`) en cas d'échec et conservées 7 jours.

La base utilisée en CI est `criticalfail_test` (surcharge via `e2e/docker-compose.test.yml`), isolée de la base de production.

---

## Ajouter un test

1. Créer `specs/XX-ma-feature.spec.ts`.
2. Importer `{ test, expect }` depuis `../fixtures/index.ts` (pas directement de `@playwright/test`) pour avoir accès aux fixtures `adminToken` et `sessionCode`.
3. Appeler `resetDb()` dans un `beforeEach` si le test modifie des données.
4. Utiliser les page objects (`AdminPage`, `PlayerPage`, `TvPage`) pour éviter de dupliquer les sélecteurs.
