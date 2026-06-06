# check-docs.ps1 -- Verifie que CLAUDE.md/README.md sont a jour apres modifications de code
# Declenche par le hook Stop de Claude Code
# Emplacement : .claude/hooks/check-docs.ps1 (relatif a la racine du repo)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$changedFiles = git -C $repoRoot diff --name-only HEAD 2>$null
$stagedFiles  = git -C $repoRoot diff --name-only --cached 2>$null
$allChanged   = ($changedFiles + $stagedFiles) | Select-Object -Unique

if (-not $allChanged) { exit 0 }

$sourcePatterns = @(
    '^backend/src/routes/',
    '^backend/src/socket\.js$',
    '^backend/src/migrations\.js$',
    '^backend/src/index\.js$',
    '^backend/src/demo\.js$',
    '^frontend/src/stores/',
    '^frontend/src/router/',
    '^frontend/src/socket\.js$',
    '^docker-compose',
    '^backend/package\.json$',
    '^frontend/package\.json$',
    '^package\.json$'
)

$docFiles = @('CLAUDE.md', 'README.md')

$sourceChanged = $allChanged | Where-Object {
    $f = $_; $sourcePatterns | Where-Object { $f -match $_ }
}

if (-not $sourceChanged) { exit 0 }

$docChanged = $allChanged | Where-Object { $docFiles -contains $_ }

if (-not $docChanged) {
    $fileList = ($sourceChanged) -join ", "
    Write-Error @"
[check-docs] ATTENTION : fichiers source modifies sans mise a jour de la documentation.

Fichiers source : $fileList

Verifiez si CLAUDE.md ou README.md doivent etre mis a jour :
  - CLAUDE.md : architecture, evenements socket, tables DB, conventions
  - README.md : fonctionnalites, variables d'environnement, stack
"@
}

exit 0
