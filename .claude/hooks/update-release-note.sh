#!/usr/bin/env bash
  # update-release-notes.sh -- Met à jour release-notes.json automatiquement après chaque chantier
  # Déclenché par le hook Stop de Claude Code — s'exécute en arrière-plan

  REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

  # Détecter les modifications de fichiers source (pas les données ni la doc)
  CHANGED=$(git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null)
  STAGED=$(git -C "$REPO_ROOT" diff --name-only --cached 2>/dev/null)
  ALL=$(printf '%s\n%s\n' "$CHANGED" "$STAGED" | sort -u | grep -v '^$')

  [ -z "$ALL" ] && exit 0

  SOURCE_CHANGED=$(echo "$ALL" \
    | grep -E '^(backend/src/|frontend/src/)' \
    | grep -v 'release-notes\.json')

  [ -z "$SOURCE_CHANGED" ] && exit 0

  TODAY=$(date +%Y-%m-%d)
  FILE_LIST=$(echo "$SOURCE_CHANGED" | tr '\n' ', ' | sed 's/, $//')
  DIFF=$(git -C "$REPO_ROOT" diff HEAD -- $(echo "$SOURCE_CHANGED" | head -10 | tr '\n' ' ') 2>/dev/null | head -150)
  RELEASE_NOTES_PATH="$REPO_ROOT/backend/src/data/release-notes.json"

  # --bare désactive les hooks dans la session enfant → pas de boucle infinie
  (claude -p \
    --bare \
    --output-format text \
    --allowedTools "Read,Edit" \
    --add-dir "$REPO_ROOT" \
    --no-session-persistence \
    "Projet DM Toolkit (app web D&D 5e, gestion de sessions JDR pour le Maître du Jeu).

  Fichiers source modifiés lors du dernier chantier : $FILE_LIST
  Date du jour : $TODAY
  Chemin du fichier : $RELEASE_NOTES_PATH

  Diff (extrait) :
  \`\`\`diff
  $DIFF
  \`\`\`

  Tâche : lis $RELEASE_NOTES_PATH pour connaître la version actuelle, puis modifie ce fichier uniquement :
  1. Incrémente le numéro de patch (ex. 1.0.43 → 1.0.44)
  2. Insère une nouvelle entrée au DÉBUT du tableau 'notes' avec :
     - \"version\" : le nouveau numéro
     - \"date\" : \"$TODAY\"
     - \"changes\" : tableau de 1 à 3 objets décrivant les changements visibles utilisateur en français
       (chaque objet : \"type\" parmi 'feature'/'improvement'/'fix', \"role\" parmi 'admin'/'player'/'all', \"text\" : description concise)
  3. Respecte le format JSON exact des entrées existantes.

  Ne modifie QUE le fichier release-notes.json. Rien d'autre." \
    2>/dev/null) &

  exit 0