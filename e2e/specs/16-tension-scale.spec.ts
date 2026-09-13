import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

// L'échelle de tension classique (singleton) a été remplacée par une jauge nommée
// (dashboard_gauges) affichable en plein écran — la même jauge peut aussi être composée
// dans la vue dynamique (voir 27-dashboard.spec.ts pour ce cas). Créer une jauge et créer/adjuster
// l'échelle de tension sont désormais deux actions distinctes.
async function createGaugeAndShowFullscreen(adminPage: AdminPage, title = 'Tension', steps = 6) {
  await adminPage.switchTab('tension')
  const pg = adminPage.page

  // Scope à la section Jauges pour éviter de matcher les inputs des autres sections
  // (v-show garde tout monté).
  const gaugeSection = pg.locator('.control-section').filter({ hasText: /jauges \(vue dynamique\)/i })

  const titleInput = gaugeSection.locator('input[placeholder*="titre de la jauge" i]')
  await titleInput.click({ clickCount: 3 }) // sélectionne le texte par défaut du v-model Vue avant d'écrire
  await titleInput.fill(title)
  await gaugeSection.locator('input[type="number"]').fill(String(steps))
  await gaugeSection.getByTestId('gauge-create-btn').click()

  const gaugeRow = pg.locator('.gauge-row').filter({ hasText: title })
  await gaugeRow.getByTestId('gauge-fullscreen-btn').click()
}

test('admin creates a gauge, shows it fullscreen and TV shows it', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createGaugeAndShowFullscreen(adminPage, 'Combat épique', 5)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('tension')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'tension', { timeout: 8_000 })
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can increment the fullscreen gauge and TV updates', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createGaugeAndShowFullscreen(adminPage, 'Alarme', 4)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('tension')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'tension', { timeout: 8_000 })
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 8_000 })

    // Increment — bouton '+1' de la ligne de la jauge (partagé avec le composé dashboard :
    // un seul chemin d'ajustement quel que soit où la jauge est affichée).
    const gaugeRow = adminPage.page.locator('.gauge-row').filter({ hasText: 'Alarme' })
    await gaugeRow.locator('button.tension-delta-btn').filter({ hasText: '+1' }).click()

    // Tension level 1 should be shown on TV
    await expect(tvPage.page.locator('.tension-level')).toContainText('1', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('gauge title visible on TV in fullscreen', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createGaugeAndShowFullscreen(adminPage, 'Invasion Imminente', 3)
    await adminPage.setTvMode('tension')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.getByText('Invasion Imminente')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can hide the fullscreen gauge', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createGaugeAndShowFullscreen(adminPage, 'Tension Finale', 3)
    await adminPage.setTvMode('tension')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 8_000 })

    // Quitter le plein écran (la jauge elle-même n'est pas supprimée, voir 27-dashboard.spec.ts)
    await adminPage.switchTab('tension')
    await adminPage.page.getByTestId('gauge-hide-fullscreen-btn').click()

    // TV should revert to lobby
    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('gauge steps are displayed on TV in fullscreen', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createGaugeAndShowFullscreen(adminPage, 'Échelle', 5)
    await adminPage.setTvMode('tension')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getTensionDisplay()).toBeVisible({ timeout: 8_000 })

    // 5 step indicators should be visible
    await expect(tvPage.page.locator('.tension-step')).toHaveCount(5, { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
