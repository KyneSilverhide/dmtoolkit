import { test, expect } from '../fixtures'
import { getAdminToken } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

async function startDoomClock(adminPage: AdminPage, minutes = 0, seconds = 30, title = 'DOOM CLOCK') {
  await adminPage.switchTab('tension')
  const pg = adminPage.page
  const titleInput = pg.locator('input').filter({ hasText: '' }).nth(0)
  // Fill title if input is accessible
  const titleEl = pg.locator('input[placeholder*="Doom" i], input[placeholder*="doom" i], input[placeholder*="titre" i]').first()
  if (await titleEl.count()) await titleEl.fill(title)

  const minInput = pg.locator('input[type="number"]').first()
  await minInput.fill(String(minutes))
  const secInput = pg.locator('input[type="number"]').nth(1)
  if (await secInput.count()) await secInput.fill(String(seconds))

  await pg.locator('button.action-btn').filter({ hasText: 'Lancer' }).first().click()
}

test('admin can start doom clock and TV shows it', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startDoomClock(adminPage, 0, 30)

    // TV mode should switch to doom automatically or admin switches it
    await adminPage.setTvMode('doom').catch(() => {})

    await expect(tvPage.getDoomTimer()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('doom clock counts down on TV', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startDoomClock(adminPage, 0, 10)
    await adminPage.setTvMode('doom').catch(() => {})
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'doom', { timeout: 5_000 })
    await expect(tvPage.getDoomTimer()).toBeVisible({ timeout: 5_000 })

    const firstText = await tvPage.getDoomTimer().textContent()
    await tvPage.page.waitForTimeout(2_000)
    const secondText = await tvPage.getDoomTimer().textContent()

    // Timer should have changed (countdown)
    expect(firstText).not.toBe(secondText)
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can stop doom clock', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startDoomClock(adminPage, 0, 30)
    await adminPage.setTvMode('doom').catch(() => {})
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'doom', { timeout: 5_000 })
    await expect(tvPage.getDoomTimer()).toBeVisible({ timeout: 5_000 })

    // Stop the clock
    await adminPage.switchTab('tension')
    await adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: 'Arrêter' }).first().click()

    // TV should revert to lobby
    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('doom clock danger style applies when time is low', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    // Very short clock (5 seconds) to trigger danger zone
    await startDoomClock(adminPage, 0, 5)
    await adminPage.setTvMode('doom').catch(() => {})
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'doom', { timeout: 5_000 })
    await expect(tvPage.getDoomTimer()).toBeVisible({ timeout: 5_000 })

    // With 5 seconds remaining, danger class should be applied
    await expect(tvPage.getDoomTimer()).toHaveClass(/danger/, { timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('doom clock title displayed on TV', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startDoomClock(adminPage, 0, 20, 'Éruption Volcanique')
    await adminPage.setTvMode('doom').catch(() => {})
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'doom', { timeout: 5_000 })
    await expect(tvPage.page.getByText(/Éruption|Volcanique|DOOM/i).first()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
