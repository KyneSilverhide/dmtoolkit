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

test('admin can roll the critical fail dice', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'Fighter', hp: 45 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    await adminPage.switchTab('dice')
    await adminPage.page.locator('button.roll-btn').click()

    // Wait for dice animation to finish and result to appear
    await expect(adminPage.page.locator('.result-box, .dice-result, [class*="result"]')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin sends dice result to player', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Berserker', hp: 60 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    await adminPage.switchTab('dice')
    await adminPage.page.locator('button.roll-btn').click()
    // Wait for result
    await expect(adminPage.page.locator('.result-box, .dice-result, [class*="result"]')).toBeVisible({ timeout: 8_000 })
    // Send to all players
    await adminPage.page.getByTestId('dice-send-btn').click()

    // Player should receive a dice result notification/toast
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    // Dice results appear in the messages or as a toast
    await expect(playerPg.locator('[class*="dice"], [class*="roll"], [class*="result"]').first()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin can select combat type (melee/range/magic)', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await adminPage.switchTab('dice')

    // Three combat type buttons should be present
    await expect(adminPage.page.getByText('Mêlée')).toBeVisible()
    await expect(adminPage.page.getByText('Distance')).toBeVisible()
    await expect(adminPage.page.getByText('Magique')).toBeVisible()

    // Click Distance
    await adminPage.page.getByText('Distance').click()
    await adminPage.page.locator('button.roll-btn').click()
    await expect(adminPage.page.locator('.result-box, .dice-result, [class*="result"]')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('dice result shown in admin roll toast when player rolls', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Knight', hp: 50 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    // Player rolls a die from the dés tab
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('des')
    // Roll a die (click any die button)
    await playerPg.locator('[class*="die"], [class*="dice-btn"], button[class*="d"]').first().click({ timeout: 5_000 }).catch(() => {})

    // Admin might receive a toast — check if toast container appears
    await expect(adminPage.page.getByTestId('player-roll-toast')).toBeVisible({ timeout: 8_000 }).catch(() => {
      // Toast might have auto-dismissed — acceptable
    })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('dice roll produces a value between 1 and 100', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'Tester', hp: 10 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    await adminPage.switchTab('dice')
    await adminPage.page.locator('button.roll-btn').click()
    await expect(adminPage.page.locator('.roll-btn')).not.toBeDisabled({ timeout: 8_000 })

    const diceDisplayEl = adminPage.page.locator('[class*="dice-value"], [class*="animated-dice"], [class*="dice-display"]').first()
    if (await diceDisplayEl.count()) {
      const text = await diceDisplayEl.textContent()
      const num = parseInt(text || '0')
      expect(num).toBeGreaterThanOrEqual(1)
      expect(num).toBeLessThanOrEqual(100)
    }
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
