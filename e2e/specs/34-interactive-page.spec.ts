import { test, expect } from '../fixtures'
import { createSessionFull } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

// Page qui parle le pont dmt-bridge : un compteur que seul le MJ incrémente.
const BRIDGED_PAGE = `<!DOCTYPE html><html><head></head><body>
<div id="role">?</div><div id="players"></div><div id="count">0</div><button id="inc">+1</button>
<script>
var state = { count: 0 }, role = null
function render() { document.getElementById('count').textContent = state.count }
window.addEventListener('message', function (e) {
  var d = e.data || {}
  if (d.type === 'dmt:init') {
    role = d.role
    document.getElementById('role').textContent = d.role
    document.getElementById('players').textContent = (d.players || []).map(function (p) { return p.name }).join(',')
    if (d.state) state = d.state
    render()
  }
  if (d.type === 'dmt:state' && role === 'tv') { state = d.state; render() }
})
document.getElementById('inc').onclick = function () {
  state = { count: state.count + 1 }
  render()
  parent.postMessage({ type: 'dmt:state', state: state }, '*')
}
parent.postMessage({ type: 'dmt:ready', version: 1 }, '*')
</script></body></html>`

// Page sans pont : le MJ clique, la TV rejoue les clics.
const PLAIN_PAGE = `<!DOCTYPE html><html><head></head><body>
<button id="inc" onclick="var c=document.getElementById('count'); c.textContent = Number(c.textContent) + 1">+1</button>
<div id="count">0</div></body></html>`

async function uploadInteractive(adminToken: string, sessionId: number, html: string, name: string): Promise<void> {
  const formData = new FormData()
  formData.append('session_id', String(sessionId))
  formData.append('file', new Blob([html], { type: 'text/html' }), name)
  const res = await fetch(`${BACKEND_URL}/api/uploads/interactive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: formData,
  })
  if (!res.ok) throw new Error(`interactive upload failed: ${res.status} ${await res.text()}`)
}

async function showFirstPage(adminPage: AdminPage) {
  await adminPage.switchTab('puzzle')
  const item = adminPage.page.locator('.puzzle-item[data-kind="interactive"]').first()
  await expect(item).toBeVisible({ timeout: 8_000 })
  await item.locator('.show-btn').click()
}

const gmFrame = (adminPage: AdminPage) =>
  adminPage.page.frameLocator('.active-interactive-section [data-testid="interactive-stage"] iframe')
const tvFrame = (tvPage: TvPage) =>
  tvPage.page.frameLocator('[data-testid="tv-mode-interactive"] iframe')

test('le MJ pilote la page, la TV suit, le joueur ne voit rien', async ({ browser, adminToken }) => {
  test.setTimeout(45_000)
  const { id, code } = await createSessionFull(adminToken)
  await uploadInteractive(adminToken, id, BRIDGED_PAGE, 'compteur.html')

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Tana', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await showFirstPage(adminPage)

    const gm = gmFrame(adminPage)
    await expect(gm.locator('#role')).toHaveText('gm', { timeout: 8_000 })
    await expect(gm.locator('#players')).toHaveText('Tana')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.getByTestId('tv-mode-interactive')).toBeVisible({ timeout: 8_000 })
    expect(await tvPage.getCurrentMode()).toBe('interactive')
    const tv = tvFrame(tvPage)
    await expect(tv.locator('#role')).toHaveText('tv', { timeout: 8_000 })

    await gm.locator('#inc').click()
    await gm.locator('#inc').click()
    await expect(tv.locator('#count')).toHaveText('2', { timeout: 8_000 })

    // La TV n'est pas cliquable.
    await expect(tvPage.page.locator('[data-testid="tv-mode-interactive"] iframe')).toHaveCSS('pointer-events', 'none')

    // Rien chez le joueur.
    await expect(playerPg.getByTestId('player-tab-puzzle')).toHaveCount(0)

    // L'état survit au rechargement de la TV et de l'aperçu MJ (il est en base).
    await tvPage.page.reload()
    await expect(tvFrame(tvPage).locator('#count')).toHaveText('2', { timeout: 8_000 })
    await adminPage.page.reload()
    await adminPage.switchTab('puzzle')
    await expect(gmFrame(adminPage).locator('#count')).toHaveText('2', { timeout: 8_000 })

    // Fermer : la TV revient au lobby.
    await adminPage.page.getByTestId('interactive-close').click()
    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('une page sans pont : la TV rejoue les clics du MJ', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const { id, code } = await createSessionFull(adminToken)
  await uploadInteractive(adminToken, id, PLAIN_PAGE, 'simple.html')

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)
    await showFirstPage(adminPage)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    const tv = tvFrame(tvPage)
    await expect(tv.locator('#count')).toHaveText('0', { timeout: 8_000 })

    const gm = gmFrame(adminPage)
    await gm.locator('#inc').click()
    await gm.locator('#inc').click()
    await expect(gm.locator('#count')).toHaveText('2')
    await expect(tv.locator('#count')).toHaveText('2', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
