#!/bin/sh
cat > /usr/share/nginx/html/config.js <<EOF
window.BACKEND_URL = "${BACKEND_URL:-}";
EOF
exec nginx -g 'daemon off;'
