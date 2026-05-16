#Requires -Version 5.1
<#
.SYNOPSIS
    Lance les tests e2e Playwright contre un environnement Docker isolé.

.PARAMETER Build
    Rebuild les images Docker avant de démarrer (défaut: true).

.PARAMETER Mode
    Mode Playwright : headless (défaut), headed, ui.

.PARAMETER Keep
    Garde les containers en vie après les tests.

.PARAMETER Spec
    Filtre de spec à passer à Playwright (ex: "specs/04-*" ou "specs/04-hp-sync.spec.ts").

.EXAMPLE
    .\e2e-test.ps1
    .\e2e-test.ps1 -Build:$false
    .\e2e-test.ps1 -Mode ui
    .\e2e-test.ps1 -Mode headed -Spec "specs/04-hp-sync.spec.ts"
    .\e2e-test.ps1 -Keep
#>
param(
    [switch]$Build = $true,
    [ValidateSet('headless', 'headed', 'ui')]
    [string]$Mode = 'headless',
    [switch]$Keep,
    [string]$Spec = ''
)

$ComposeBase = @('-f', 'docker-compose.yml', '-f', 'e2e/docker-compose.test.yml')
$BackendUrl  = 'http://localhost:3000'
$FrontendUrl = 'http://localhost:5173'

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "    ERR $msg" -ForegroundColor Red }

function Wait-Http([string]$url, [int]$timeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -lt 500) { return }
        } catch {}
        Start-Sleep -Seconds 2
    }
    throw "Timeout: $url inaccessible apres $timeoutSec s"
}

# ── 1. Tear down ──────────────────────────────────────────────────────────────
Write-Step "Arret des containers existants"
docker compose @ComposeBase down --remove-orphans *>$null
Write-Ok "Containers arretes"

# ── 2. Build ──────────────────────────────────────────────────────────────────
if ($Build) {
    Write-Step "Build des images Docker"
    docker compose @ComposeBase build
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build echoue"; exit 1 }
    Write-Ok "Images buildees"
}

# ── 3. Start ──────────────────────────────────────────────────────────────────
Write-Step "Demarrage du stack de test"
docker compose @ComposeBase up -d
if ($LASTEXITCODE -ne 0) { Write-Fail "Demarrage echoue"; exit 1 }

# ── 4. Wait for services ──────────────────────────────────────────────────────
Write-Step "Attente du backend ($BackendUrl/api/health)"
try {
    Wait-Http "$BackendUrl/api/health" 90
    Write-Ok "Backend pret"
} catch {
    Write-Fail $_
    Write-Host "`nLogs backend :" -ForegroundColor Yellow
    docker compose @ComposeBase logs backend --tail 50
    docker compose @ComposeBase down --remove-orphans *>$null
    exit 1
}

Write-Step "Attente du frontend ($FrontendUrl)"
try {
    Wait-Http $FrontendUrl 30
    Write-Ok "Frontend pret"
} catch {
    Write-Fail $_
    Write-Host "`nLogs frontend :" -ForegroundColor Yellow
    docker compose @ComposeBase logs frontend --tail 30
    docker compose @ComposeBase down --remove-orphans *>$null
    exit 1
}

# ── 5. Run Playwright ─────────────────────────────────────────────────────────
Write-Step "Lancement des tests Playwright ($Mode)"

$env:BACKEND_URL            = $BackendUrl
$env:PLAYWRIGHT_BASE_URL    = $FrontendUrl
$env:DATABASE_URL           = 'postgresql://criticalfail:criticalfail@localhost:5432/criticalfail_test'
$env:ADMIN_DEFAULT_USERNAME = 'admin'
$env:ADMIN_DEFAULT_PASSWORD = 'admin'

$playwrightArgs = @()
switch ($Mode) {
    'headed' { $playwrightArgs += '--headed' }
    'ui'     { $playwrightArgs += '--ui' }
}
if ($Spec) { $playwrightArgs += $Spec }

Push-Location e2e
try {
    npx playwright test @playwrightArgs
    $testExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

# ── 6. Teardown ───────────────────────────────────────────────────────────────
if (-not $Keep) {
    Write-Step "Arret des containers"
    docker compose @ComposeBase down --remove-orphans *>$null
    Write-Ok "Containers arretes"
} else {
    Write-Host "`n    Containers maintenus (-Keep actif). Pour arreter :" -ForegroundColor Yellow
    Write-Host "    docker compose -f docker-compose.yml -f e2e/docker-compose.test.yml down" -ForegroundColor Yellow
}

# ── 7. Hint rapport ───────────────────────────────────────────────────────────
if ($testExitCode -ne 0) {
    Write-Host "`nTests en echec. Rapport HTML :" -ForegroundColor Red
    Write-Host "    cd e2e && npx playwright show-report" -ForegroundColor Yellow
}

exit $testExitCode
