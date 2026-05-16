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

test('player can roll a d20', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Rogue', hp: 32 })

  const playerPage = new PlayerPage(page)
  await playerPage.switchTab('des')

  // d20 is selected by default; click roll
  await page.locator('button.roll-btn.normal').click()

  // Result should appear
  await expect(page.locator('.result-total')).toBeVisible({ timeout: 5_000 })
  const result = await page.locator('.result-total').textContent()
  const num = parseInt(result || '0')
  expect(num).toBeGreaterThanOrEqual(1)
  expect(num).toBeLessThanOrEqual(20)
})

test('player can switch dice types', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Wizard', hp: 24 })

  const playerPage = new PlayerPage(page)
  await playerPage.switchTab('des')

  // Switch to d6
  await page.locator('button.die-btn').filter({ hasText: 'd6' }).click()
  await page.locator('button.roll-btn.normal').click()

  await expect(page.locator('.result-total')).toBeVisible({ timeout: 5_000 })
  const result = await page.locator('.result-total').textContent()
  const num = parseInt(result || '0')
  expect(num).toBeGreaterThanOrEqual(1)
  expect(num).toBeLessThanOrEqual(6)
})

test('player hidden roll notifies admin without showing result to player', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Assassin', hp: 28 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('des')
    await playerPg.locator('button.roll-btn.hidden').click()

    // Player sees "hidden sent" feedback
    await expect(playerPg.getByText(/caché/i)).toBeVisible({ timeout: 5_000 })

    // Admin sees the roll toast (toast lives 6s, emitted right after hidden roll)
    await expect(adminPage.page.getByTestId('player-roll-toast')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('advantage roll only available for d20 × 1', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Hero', hp: 50 })

  const playerPage = new PlayerPage(page)
  await playerPage.switchTab('des')

  // Advantage buttons visible with d20
  await expect(page.locator('button.roll-type-btn.advantage')).toBeVisible()

  // Switch to d6 — advantage buttons should disappear
  await page.locator('button.die-btn').filter({ hasText: 'd6' }).click()
  await expect(page.locator('button.roll-type-btn.advantage')).not.toBeVisible()
})

test('player roll result propagated as admin toast', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Brawler', hp: 55 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('des')
    await playerPg.locator('button.roll-btn.normal').click()
    await expect(playerPg.locator('.result-total')).toBeVisible({ timeout: 5_000 })

    // After a visible roll, admin should receive a roll toast (toast lives 6s)
    const toast = adminPage.page.getByTestId('player-roll-toast')
    await expect(toast).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
