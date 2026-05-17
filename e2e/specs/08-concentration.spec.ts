import { test, expect } from '../fixtures'
import { getAdminToken } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test('player can toggle concentration on', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Wizard', hp: 28 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleConcentration()

    await expect(adminPage.page.getByTestId(`player-concentrating-${playerId}`)).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('player can toggle concentration off', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Sorcerer', hp: 22 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleConcentration()
    await expect(adminPage.page.getByTestId(`player-concentrating-${playerId}`)).toBeVisible({ timeout: 5_000 })

    await playerPage.toggleConcentration()
    await expect(adminPage.page.getByTestId(`player-concentrating-${playerId}`)).not.toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('concentration warning sent when concentrating player takes damage', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Enchanter', hp: 40 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleConcentration()
    await playerPage.setHp(30)

    // The concentration-warning event triggers a modal with this heading
    await expect(playerPg.getByRole('heading', { name: /Jet de Concentration/i })).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('concentration icon visible on TV combat mode', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const { TvPage } = await import('../page-objects/TvPage')
    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('combat')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'combat', { timeout: 5_000 })

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Illusionist', hp: 26 })
    await expect(tvPage.page.getByText('Illusionist')).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleConcentration()

    // TV should show concentration indicator (bullseye icon via AppIcon)
    const playerCard = tvPage.page.locator('[data-testid^="tv-player-card-"]', { hasText: 'Illusionist' })
    await expect(playerCard.locator('[title="Concentration"]')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('concentration button UI reflects current state', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Bard', hp: 33 })

  const playerPage = new PlayerPage(page)
  const btn = page.getByTestId('concentration-toggle')

  await playerPage.toggleConcentration()
  await expect(btn).toHaveClass(/active/, { timeout: 5_000 })

  await playerPage.toggleConcentration()
  await expect(btn).not.toHaveClass(/active/, { timeout: 5_000 })
})
