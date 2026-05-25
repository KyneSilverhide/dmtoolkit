#!/bin/sh
# BACKEND_URL peut être un hostname seul (Render) ou une URL complète (docker-compose)
case "${BACKEND_URL:-}" in
  http://*|https://*) FULL_BACKEND_URL="${BACKEND_URL}" ;;
  "")                 FULL_BACKEND_URL="" ;;
  *)                  FULL_BACKEND_URL="https://${BACKEND_URL}" ;;
esac
cat > /usr/share/nginx/html/config.js <<EOF
window.BACKEND_URL = "${FULL_BACKEND_URL}";
EOF
exec nginx -g 'daemon off;'
