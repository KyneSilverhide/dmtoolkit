#!/usr/bin/env bash
# check-docs.sh -- Vérifie que CLAUDE.md/README.md sont à jour après modifications de code
# Déclenché par le hook Stop de Claude Code

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

CHANGED=$(git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null)
STAGED=$(git -C "$REPO_ROOT" diff --name-only --cached 2>/dev/null)
ALL=$(printf '%s\n%s\n' "$CHANGED" "$STAGED" | sort -u | grep -v '^$')

[ -z "$ALL" ] && exit 0

SOURCE_CHANGED=$(echo "$ALL" | grep -E '^(backend/src/|frontend/src/|docker-compose|backend/package\.json$|frontend/package\.json$|package\.json$)')

[ -z "$SOURCE_CHANGED" ] && exit 0

DOC_CHANGED=$(echo "$ALL" | grep -E '^(CLAUDE\.md|README\.md)$')

if [ -z "$DOC_CHANGED" ]; then
  FILE_LIST=$(echo "$SOURCE_CHANGED" | tr '\n' ',' | sed 's/,$//')
  echo "{\"systemMessage\": \"[check-docs] ATTENTION : fichiers source modifiés sans mise à jour de la documentation.\\n\\nFichiers source : $FILE_LIST\\n\\nVérifiez si CLAUDE.md ou README.md doivent être mis à jour :\\n  - CLAUDE.md : architecture, événements socket, tables DB, conventions\\n  - README.md : fonctionnalités, variables d'environnement, stack\"}"
fi

exit 0
