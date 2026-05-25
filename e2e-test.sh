#!/usr/bin/env bash
# e2e-test.sh — Lance les tests e2e Playwright contre un environnement Docker isolé.
#
# Usage:
#   ./e2e-test.sh
#   ./e2e-test.sh --no-build
#   ./e2e-test.sh --mode ui
#   ./e2e-test.sh --mode headed --spec "specs/04-hp-sync.spec.ts"
#   ./e2e-test.sh --keep
#   ./e2e-test.sh --local-frontend   # démarre Vite localement au lieu du container Docker

set -euo pipefail

COMPOSE_BASE=(-f docker-compose.yml -f e2e/docker-compose.test.yml)
BACKEND_URL='http://localhost:3000'
FRONTEND_URL='http://localhost:5173'

BUILD=true
MODE='headless'
KEEP=false
SPEC=''
LOCAL_FRONTEND=false
FRONTEND_PID=''

# ── Parsing des arguments ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)       BUILD=false; shift ;;
    --mode)           MODE="$2"; shift 2 ;;
    --keep)           KEEP=true; shift ;;
    --spec)           SPEC="$2"; shift 2 ;;
    --local-frontend) LOCAL_FRONTEND=true; shift ;;
    *) echo "Argument inconnu : $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
step() { echo -e "\n\033[36m==> $*\033[0m"; }
ok()   { echo -e "    \033[32mOK\033[0m  $*"; }
fail() { echo -e "    \033[31mERR\033[0m $*"; }

wait_http() {
  local url="$1"
  local timeout="${2:-90}"
  local deadline=$((SECONDS + timeout))
  while [[ $SECONDS -lt $deadline ]]; do
    if curl -sf --max-time 3 "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# ── Teardown automatique (trap EXIT) ─────────────────────────────────────────
cleanup() {
  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ "$KEEP" == false ]]; then
    step "Arret des containers"
    docker compose "${COMPOSE_BASE[@]}" down --remove-orphans > /dev/null 2>&1 || true
    ok "Containers arretes"
  else
    echo -e "\n    \033[33mContainers maintenus (--keep actif). Pour arreter :\033[0m"
    echo "    docker compose -f docker-compose.yml -f e2e/docker-compose.test.yml down"
  fi
}
trap cleanup EXIT

# ── 1. Tear down ──────────────────────────────────────────────────────────────
step "Arret des containers existants"
docker compose "${COMPOSE_BASE[@]}" down --remove-orphans > /dev/null 2>&1 || true
ok "Containers arretes"

# ── 2. Build ──────────────────────────────────────────────────────────────────
if [[ "$BUILD" == true ]]; then
  step "Build des images Docker"
  if [[ "$LOCAL_FRONTEND" == true ]]; then
    docker compose "${COMPOSE_BASE[@]}" build postgres backend
  else
    docker compose "${COMPOSE_BASE[@]}" build
  fi
  ok "Images buildees"
fi

# ── 3. Start ──────────────────────────────────────────────────────────────────
step "Demarrage du stack de test"
if [[ "$LOCAL_FRONTEND" == true ]]; then
  docker compose "${COMPOSE_BASE[@]}" up -d postgres dmtoolkit-backend
else
  docker compose "${COMPOSE_BASE[@]}" up -d
fi

# ── 4a. Attente du backend ────────────────────────────────────────────────────
step "Attente du backend ($BACKEND_URL/api/health)"
if wait_http "$BACKEND_URL/api/health" 90; then
  ok "Backend pret"
else
  fail "Timeout : $BACKEND_URL/api/health inaccessible apres 90s"
  echo -e "\n\033[33mLogs backend :\033[0m"
  docker compose "${COMPOSE_BASE[@]}" logs dmtoolkit-backend --tail 50
  exit 1
fi

# ── 4b. Frontend ──────────────────────────────────────────────────────────────
if [[ "$LOCAL_FRONTEND" == true ]]; then
  step "Demarrage du frontend local (Vite dev server)"
  (cd frontend && npm run dev -- --port 5173 --host) &
  FRONTEND_PID=$!
  ok "Frontend local demarre (PID $FRONTEND_PID)"
fi

step "Attente du frontend ($FRONTEND_URL)"
if wait_http "$FRONTEND_URL" 60; then
  ok "Frontend pret"
else
  fail "Timeout : $FRONTEND_URL inaccessible apres 60s"
  if [[ "$LOCAL_FRONTEND" == false ]]; then
    echo -e "\n\033[33mLogs frontend :\033[0m"
    docker compose "${COMPOSE_BASE[@]}" logs frontend --tail 30
  fi
  exit 1
fi

# ── 5. Run Playwright ─────────────────────────────────────────────────────────
step "Lancement des tests Playwright ($MODE)"

export BACKEND_URL
export PLAYWRIGHT_BASE_URL="$FRONTEND_URL"
export DATABASE_URL='postgresql://criticalfail:criticalfail@localhost:5432/criticalfail_test'
export ADMIN_DEFAULT_USERNAME='admin'
export ADMIN_DEFAULT_PASSWORD='admin'

playwright_args=()
case "$MODE" in
  headed) playwright_args+=(--headed) ;;
  ui)     playwright_args+=(--ui) ;;
esac
[[ -n "$SPEC" ]] && playwright_args+=("$SPEC")

set +e
(cd e2e && npx playwright test "${playwright_args[@]}")
test_exit_code=$?
set -e

# ── 6. Hint rapport ───────────────────────────────────────────────────────────
if [[ $test_exit_code -ne 0 ]]; then
  echo -e "\n\033[31mTests en echec. Rapport HTML :\033[0m"
  echo "    cd e2e && npx playwright show-report"
fi

exit $test_exit_code
