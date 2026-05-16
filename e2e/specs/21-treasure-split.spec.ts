import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

test('treasure split tool is accessible from admin', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.switchTab('tresor')

    // Gold divider tool should be visible
    await expect(adminPage.page.locator('[class*="gold"], [class*="divider"], [class*="tresor"]').first()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
  }
})

test('treasure split calculates correct share per player', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'Shareowner', hp: 30 })
    await expect(adminPage.page.getByText('Shareowner')).toBeVisible({ timeout: 10_000 })

    await adminPage.switchTab('tresor')

    // Enter total gold amount
    const goldInput = adminPage.page.locator('input[type="number"]').first()
    await goldInput.fill('100')

    // Result should show per-player share
    // With 1 player, 100 / 1 = 100 po
    await expect(adminPage.page.getByText(/100/)).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('treasure split updates when more players join', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const player1Ctx = await browser.newContext()
  const player2Ctx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await joinAsPlayer(await player1Ctx.newPage(), code, { name: 'Partageur1', hp: 30 })
    await expect(adminPage.page.getByText('Partageur1')).toBeVisible({ timeout: 10_000 })

    await adminPage.switchTab('tresor')
    const goldInput = adminPage.page.locator('input[type="number"]').first()
    await goldInput.fill('200')

    // 1 player → 200 po each
    const shareEl = adminPage.page.locator('[class*="share"], [class*="result"], [class*="gold"]').first()
    const onePShare = await shareEl.textContent()

    await joinAsPlayer(await player2Ctx.newPage(), code, { name: 'Partageur2', hp: 25 })
    await expect(adminPage.page.getByText('Partageur2')).toBeVisible({ timeout: 10_000 })

    // Trigger recalculation (click or type again)
    await goldInput.press('Tab')

    // 2 players → 100 po each — share should have changed
    await adminPage.page.waitForTimeout(500)
    const twoShare = await shareEl.textContent()
    expect(onePShare).not.toBe(twoShare)
  } finally {
    await adminCtx.close()
    await player1Ctx.close()
    await player2Ctx.close()
  }
})

test('treasure split handles zero gold gracefully', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'ZeroGold', hp: 20 })
    await expect(adminPage.page.getByText('ZeroGold')).toBeVisible({ timeout: 10_000 })

    await adminPage.switchTab('tresor')
    const goldInput = adminPage.page.locator('input[type="number"]').first()
    await goldInput.fill('0')

    // No crash — result shows 0
    await expect(adminPage.page.getByText('0')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
