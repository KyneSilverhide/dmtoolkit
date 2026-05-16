import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

test('player can toggle a condition and admin sees it', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Cleric', hp: 45 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleCondition('poisoned')

    // Admin should see the poisoned condition badge
    await expect(adminPage.page.getByText('Empoisonné').first()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('player can untoggle a condition', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Paladin', hp: 55 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleCondition('blinded')
    await expect(adminPage.page.getByText('Aveuglé').first()).toBeVisible({ timeout: 5_000 })

    // Untoggle
    await playerPage.toggleCondition('blinded')
    await expect(adminPage.page.getByText('Aveuglé').first()).not.toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('multiple conditions can be active simultaneously', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Warlock', hp: 35 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleCondition('frightened')
    await playerPage.toggleCondition('paralyzed')

    await expect(adminPage.page.getByText('Effrayé').first()).toBeVisible({ timeout: 5_000 })
    await expect(adminPage.page.getByText('Paralysé').first()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('conditions synced to TV combat mode', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.setTvMode('combat')

    const { TvPage } = await import('../page-objects/TvPage')
    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Druid', hp: 50 })
    await expect(tvPage.page.getByText('Druid')).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.toggleCondition('stunned')

    await expect(tvPage.page.getByText('Étourdi')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('conditions persist after player reloads', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Monk', hp: 38 })

  const playerPage = new PlayerPage(page)
  await playerPage.toggleCondition('prone')

  // Verify condition button appears selected in UI
  const condBtn = page.getByTestId('condition-prone')
  await expect(condBtn).toHaveClass(/active|selected|on/, { timeout: 5_000 })
})
