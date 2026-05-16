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

  // Scope to the tension section to avoid matching inputs from other tabs (v-show keeps all mounted)
  const tensionSection = pg.locator('.control-section').filter({ hasText: /échelle de tension/i })

  const titleInput = tensionSection.locator('input[placeholder*="échelle" i]')
  await titleInput.click({ clickCount: 3 }) // sélectionne le texte par défaut du v-model Vue avant d'écrire
  await titleInput.fill(title)
  await tensionSection.locator('input[type="number"]').fill(String(steps))
  await tensionSection.locator('button.action-btn').filter({ hasText: 'Créer' }).click()
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
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'tension', { timeout: 5_000 })
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
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'tension', { timeout: 5_000 })
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 5_000 })

    // Increment tension — scope to the tension section, button text is '+1' (ascending) or '-1' (descending)
    await adminPage.switchTab('tension')
    const tensionSection = adminPage.page.locator('.control-section').filter({ hasText: /échelle de tension/i })
    await tensionSection.locator('button.action-btn').filter({ hasText: /^\+1$|^-1$/ }).click()

    // Tension level 1 should be shown on TV
    await expect(tvPage.page.locator('.tension-level')).toContainText('1', { timeout: 5_000 })
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
    await expect(tvPage.page.getByText('Invasion Imminente')).toBeVisible({ timeout: 5_000 })
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
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 5_000 })

    // End tension
    await adminPage.switchTab('tension')
    await adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: 'Terminer' }).click()

    // TV should revert to lobby
    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 5_000 })
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
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 5_000 })

    // 5 step indicators should be visible
    await expect(tvPage.page.locator('.tension-step')).toHaveCount(5, { timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
