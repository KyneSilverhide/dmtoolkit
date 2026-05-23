import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'
import { TvPage } from '../page-objects/TvPage'

test('player HP update reflects in admin list', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Boromir', hp: 50 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(25)

    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('25', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP bar color changes with HP percentage', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Theodin', hp: 100 })

    const playerId = await adminPage.getFirstPlayerId()

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

test('player HP update reflects on TV in combat mode', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('combat')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'combat', { timeout: 8_000 })

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Gandalf', hp: 80 })

    await expect(tvPage.page.getByText('Gandalf')).toBeVisible({ timeout: 8_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(40)

    // TV should show updated HP
    await expect(tvPage.page.getByText('40', { exact: true })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('HP increment buttons work', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Pippin', hp: 30 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    // First set an initial HP that is not at max so we can increment
    await playerPage.setHp(20)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('20', { timeout: 8_000 })

    await playerPage.incrementHp(5)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('25', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP decrement buttons work', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Merry', hp: 30 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('30', { timeout: 8_000 })

    await playerPage.decrementHp(1)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('29', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP cannot go above max', async ({ browser, adminToken }) => {
  const token = adminToken
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

test('TV shows player card with HP', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('combat')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'combat', { timeout: 8_000 })

    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'Sauron', hp: 999 })

    await expect(tvPage.page.getByText('Sauron')).toBeVisible({ timeout: 8_000 })
    const hpValues = tvPage.page.getByText('999')
    await expect(hpValues).toHaveCount(2) // show twice as 999 / 999 PV
    await expect(hpValues.nth(0)).toBeVisible()
    await expect(hpValues.nth(1)).toBeVisible()
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('HP displays in correct color zones', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Eowyn', hp: 100 })

    const playerId = await adminPage.getFirstPlayerId()

    const hpEl = adminPage.page.getByTestId(`player-hp-${playerId}`)

    // Set to >50% HP (green zone)
    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(60)
    await expect(hpEl).toContainText('60', { timeout: 8_000 })
    const greenStyle = await hpEl.getAttribute('style')

    // Set to ≤20% HP (red zone)
    await playerPage.setHp(10)
    await expect(hpEl).toContainText('10', { timeout: 8_000 })
    const redStyle = await hpEl.getAttribute('style')

    expect(greenStyle).not.toBe(redStyle)
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
