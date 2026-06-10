import { test, expect } from '../fixtures'
import { createSessionFull } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

async function uploadPuzzle(adminToken: string, sessionId: number): Promise<void> {
  const html = `<!DOCTYPE html><html><body><div id="root"><button id="tile-0">X</button></div></body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const formData = new FormData()
  formData.append('session_id', String(sessionId))
  formData.append('file', blob, 'test-puzzle.html')

  const res = await fetch(`${BACKEND_URL}/api/uploads/puzzle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: formData,
  })
  if (!res.ok) throw new Error(`puzzle upload failed: ${res.status} ${await res.text()}`)
}

test('admin projects a puzzle and TV switches to puzzle mode', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const { id, code } = await createSessionFull(adminToken)
  await uploadPuzzle(adminToken, id)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)
    await adminPage.switchTab('puzzle')

    const puzzleItem = adminPage.page.locator('.puzzle-item').first()
    await expect(puzzleItem).toBeVisible({ timeout: 8_000 })
    await puzzleItem.locator('.show-btn').click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.getByTestId('tv-mode-puzzle')).toBeVisible({ timeout: 8_000 })
    expect(await tvPage.getCurrentMode()).toBe('puzzle')
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('player sees puzzle tab when a puzzle is active', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const { id, code } = await createSessionFull(adminToken)
  await uploadPuzzle(adminToken, id)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Puzzler', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('puzzle')
    const puzzleItem = adminPage.page.locator('.puzzle-item').first()
    await expect(puzzleItem).toBeVisible({ timeout: 8_000 })
    await puzzleItem.locator('.show-btn').click()

    await expect(playerPg.getByTestId('player-tab-puzzle').filter({ visible: true })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin closes a puzzle and TV returns to lobby', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const { id, code } = await createSessionFull(adminToken)
  await uploadPuzzle(adminToken, id)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)
    await adminPage.switchTab('puzzle')

    const puzzleItem = adminPage.page.locator('.puzzle-item').first()
    await expect(puzzleItem).toBeVisible({ timeout: 8_000 })
    await puzzleItem.locator('.show-btn').click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.getByTestId('tv-mode-puzzle')).toBeVisible({ timeout: 8_000 })

    // Close the active puzzle from admin
    const closeBtn = adminPage.page.locator('.active-puzzle-section .close-btn')
    await expect(closeBtn).toBeVisible({ timeout: 5_000 })
    await closeBtn.click()

    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
