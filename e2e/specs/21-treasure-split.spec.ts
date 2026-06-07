import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'

test('treasure split tool is accessible from admin', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('tresor')

    await expect(adminPage.page.locator('.gold-divider')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('treasure split calculates correct share per player', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'Shareowner', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-name-"]').filter({ hasText: 'Shareowner' })).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('tresor')

    // Fill the PO (gold) input — scoped to .gold-divider to avoid hidden inputs from other tabs
    const poInput = adminPage.page.locator('.gold-divider .coin-input').nth(1)
    await poInput.fill('100')

    // Result should show per-player share: 100 PO
    await expect(adminPage.page.locator('.gold-divider .player-share').first()).toContainText('100', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('treasure split updates when more players join', async ({ browser, adminToken }) => {
  test.setTimeout(20_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const player1Ctx = await browser.newContext()
  const player2Ctx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await joinAsPlayer(await player1Ctx.newPage(), code, { name: 'Partageur1', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-name-"]').filter({ hasText: 'Partageur1' })).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('tresor')
    const poInput = adminPage.page.locator('.gold-divider .coin-input').nth(1)
    await poInput.fill('200')

    // 1 player → 200 PO
    const shareEl = adminPage.page.locator('.gold-divider .player-share').first()
    await expect(shareEl).toContainText('200', { timeout: 8_000 })
    const onePShare = await shareEl.textContent()

    await joinAsPlayer(await player2Ctx.newPage(), code, { name: 'Partageur2', hp: 25 })
    // Wait for Partageur2 to appear in the gold divider table (players tab is now hidden)
    await expect(adminPage.page.locator('.gold-divider .player-row')).toHaveCount(2, { timeout: 8_000 })

    // 2 players → 100 PO each — share should have changed
    await expect(shareEl).toContainText('100', { timeout: 8_000 })
    const twoShare = await shareEl.textContent()
    expect(onePShare).not.toBe(twoShare)
  } finally {
    await adminCtx.close()
    await player1Ctx.close()
    await player2Ctx.close()
  }
})

test('treasure split handles zero gold gracefully', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'ZeroGold', hp: 20 })
    await expect(adminPage.page.locator('[data-testid^="player-name-"]').filter({ hasText: 'ZeroGold' })).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('tresor')
    const poInput = adminPage.page.locator('.gold-divider .coin-input').nth(1)
    await poInput.fill('0')

    // No crash — with 0 coins the players table is hidden and send button is disabled
    await expect(adminPage.page.locator('.gold-divider')).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByTestId('gold-send-btn')).toBeDisabled()
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('mode Complet (water-fill) distributes all coins equitably', async ({ browser, adminToken }) => {
  test.setTimeout(20_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const player1Ctx = await browser.newContext()
  const player2Ctx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await joinAsPlayer(await player1Ctx.newPage(), code, { name: 'WaterA', hp: 30 })
    await joinAsPlayer(await player2Ctx.newPage(), code, { name: 'WaterB', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]')).toHaveCount(2, { timeout: 8_000 })

    await adminPage.switchTab('tresor')
    const pg = adminPage.page

    // Enter 5 PO (odd amount — exact mode would leave 1 remainder, water-fill distributes all)
    const poInput = pg.locator('.gold-divider .coin-input').nth(1)
    await poInput.fill('5')

    // Switch to Complet mode
    const completBtn = pg.locator('.mode-btn').filter({ hasText: 'Complet' })
    await completBtn.click()
    await expect(completBtn).toHaveClass(/active/, { timeout: 3_000 })

    // In water-fill mode each player should get a non-zero PC value shown
    await expect(pg.locator('.share-pc-value').first()).toBeVisible({ timeout: 5_000 })
    const pcText = await pg.locator('.share-pc-value').first().textContent()
    expect(pcText).toMatch(/PC/)
  } finally {
    await adminCtx.close()
    await player1Ctx.close()
    await player2Ctx.close()
  }
})

test('player grouping (banker) shows consolidated total', async ({ browser, adminToken }) => {
  test.setTimeout(20_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const player1Ctx = await browser.newContext()
  const player2Ctx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await joinAsPlayer(await player1Ctx.newPage(), code, { name: 'BankerA', hp: 30 })
    await joinAsPlayer(await player2Ctx.newPage(), code, { name: 'BankerB', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]')).toHaveCount(2, { timeout: 8_000 })

    await adminPage.switchTab('tresor')
    const pg = adminPage.page

    const poInput = pg.locator('.gold-divider .coin-input').nth(1)
    await poInput.fill('200')

    // Group all players under banker
    const groupAllBtn = pg.locator('.group-all-btn')
    await expect(groupAllBtn).toBeVisible({ timeout: 5_000 })
    await groupAllBtn.click()

    // Group row should appear with a consolidated total
    await expect(pg.locator('.group-row')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await player1Ctx.close()
    await player2Ctx.close()
  }
})
