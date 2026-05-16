import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

async function createTensionScale(adminPage: AdminPage, title = 'Tension', steps = 6) {
  await adminPage.switchTab('tension')
  const pg = adminPage.page

  const titleEl = pg.locator('input[placeholder*="tension" i], input[placeholder*="Tension" i]').first()
  if (await titleEl.count()) await titleEl.fill(title)

  const stepsEl = pg.locator('input[type="number"]').last()
  if (await stepsEl.count()) await stepsEl.fill(String(steps))

  await pg.locator('button.action-btn').filter({ hasText: 'Créer' }).click()
}

test('admin creates a tension scale and TV shows it', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createTensionScale(adminPage, 'Combat épique', 5)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('tension')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'tension', { timeout: 8_000 })
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can increment tension and TV updates', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createTensionScale(adminPage, 'Alarme', 4)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('tension')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'tension', { timeout: 8_000 })
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 5_000 })

    // Increment tension
    await adminPage.switchTab('tension')
    const incrementLabel = /avancer|augmenter|incrément/i
    await adminPage.page.locator('button.action-btn').filter({ hasText: incrementLabel }).click()

    // Tension level 1 should be shown on TV
    await expect(tvPage.page.locator('.tension-level')).toContainText('1', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('tension title visible on TV', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createTensionScale(adminPage, 'Invasion Imminente', 3)
    await adminPage.setTvMode('tension')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.getByText('Invasion Imminente')).toBeVisible({ timeout: 10_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can end tension scale', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createTensionScale(adminPage, 'Tension Finale', 3)
    await adminPage.setTvMode('tension')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 10_000 })

    // End tension
    await adminPage.switchTab('tension')
    await adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: 'Terminer' }).click()

    // TV should revert to lobby
    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('tension steps are displayed on TV', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createTensionScale(adminPage, 'Échelle', 5)
    await adminPage.setTvMode('tension')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 10_000 })

    // 5 step indicators should be visible
    await expect(tvPage.page.locator('.tension-step')).toHaveCount(5, { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
