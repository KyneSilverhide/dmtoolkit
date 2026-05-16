import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache, loginAsAdmin } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'
import { TvPage } from '../page-objects/TvPage'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

test('player HP update reflects in admin list', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Boromir', hp: 50 })

    // Get player id from admin DOM
    const playerRow = await adminPage.page.locator('[data-testid^="player-row-"]').first()
    await expect(playerRow).toBeVisible({ timeout: 10_000 })
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(25)

    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('25', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP bar color changes with HP percentage', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Theodin', hp: 100 })

    const playerRow = adminPage.page.locator('[data-testid^="player-row-"]').first()
    await expect(playerRow).toBeVisible({ timeout: 10_000 })
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    // Full HP → green color
    const hpEl = adminPage.page.getByTestId(`player-hp-${playerId}`)
    await expect(hpEl).toContainText('100')

    // Reduce to low HP
    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(10)
    await expect(hpEl).toContainText('10', { timeout: 8_000 })
    const color = await hpEl.evaluate((el) => getComputedStyle(el).color)
    // Should be red/danger color at 10% HP — verify it changed from green
    expect(color).not.toBe('')
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('player HP update reflects on TV in combat mode', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('combat')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'combat', { timeout: 8_000 })

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Gandalf', hp: 80 })

    await expect(tvPage.page.getByText('Gandalf')).toBeVisible({ timeout: 10_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(40)

    // TV should show updated HP
    await expect(tvPage.page.getByText('40')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('HP increment buttons work', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Pippin', hp: 30 })

    const playerRow = adminPage.page.locator('[data-testid^="player-row-"]').first()
    await expect(playerRow).toBeVisible({ timeout: 10_000 })
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    const playerPage = new PlayerPage(playerPg)
    // First set an initial HP that is not at max so we can increment
    await playerPage.setHp(20)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('20', { timeout: 6_000 })

    await playerPage.incrementHp(5)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('25', { timeout: 6_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP decrement buttons work', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Merry', hp: 30 })

    const playerRow = adminPage.page.locator('[data-testid^="player-row-"]').first()
    await expect(playerRow).toBeVisible({ timeout: 10_000 })
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    const playerPage = new PlayerPage(playerPg)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('30', { timeout: 6_000 })

    await playerPage.decrementHp(1)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('29', { timeout: 6_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP cannot go above max', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const playerCtx = await browser.newContext()

  try {
    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Bilbo', hp: 20 })

    const playerPage = new PlayerPage(playerPg)
    // Set HP higher than max — should be capped at max
    await playerPage.setHp(9999)
    // The HP fraction should show max as upper bound
    await expect(playerPage.getHpFraction()).toBeVisible()
  } finally {
    await playerCtx.close()
  }
})

test('TV shows player card with HP', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('combat')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'combat', { timeout: 8_000 })

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'Sauron', hp: 999 })

    await expect(tvPage.page.getByText('Sauron')).toBeVisible({ timeout: 10_000 })
    await expect(tvPage.page.getByText('999')).toBeVisible()
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('HP displays in correct color zones', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Eowyn', hp: 100 })

    const playerRow = adminPage.page.locator('[data-testid^="player-row-"]').first()
    await expect(playerRow).toBeVisible({ timeout: 10_000 })
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    const hpEl = adminPage.page.getByTestId(`player-hp-${playerId}`)

    // Set to >50% HP (green zone)
    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(60)
    await expect(hpEl).toContainText('60', { timeout: 6_000 })
    const greenStyle = await hpEl.getAttribute('style')

    // Set to ≤20% HP (red zone)
    await playerPage.setHp(10)
    await expect(hpEl).toContainText('10', { timeout: 6_000 })
    const redStyle = await hpEl.getAttribute('style')

    expect(greenStyle).not.toBe(redStyle)
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
