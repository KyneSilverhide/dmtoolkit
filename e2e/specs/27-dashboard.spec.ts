import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

// Vue dynamique : compose plusieurs widgets Rythme (jauges, minuteur) dans un layout —
// tv_mode exclusif 'dashboard', pas un overlay. Voir CLAUDE.md pour le garde-fou qui
// empêche les autres widgets Rythme (doom/timescale) d'éjecter ce mode par effet de bord.

async function createGauge(adminPage: AdminPage, title = 'Peur', steps = 6) {
  const pg = adminPage.page
  const gaugeSection = pg.locator('.control-section').filter({ hasText: /jauges \(vue dynamique\)/i })
  const titleInput = gaugeSection.locator('input[placeholder*="titre de la jauge" i]')
  await titleInput.click({ clickCount: 3 })
  await titleInput.fill(title)
  await gaugeSection.locator('input[type="number"]').fill(String(steps))
  await gaugeSection.getByTestId('gauge-create-btn').click()
}

test('admin composes a 2-column dashboard with a gauge and the free timer, TV shows both', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('tension')
    const pg = adminPage.page

    await createGauge(adminPage, 'Peur', 6)

    // Démarrer le minuteur libre
    await pg.getByTestId('timer-label-input').fill('Tours restants')
    await pg.getByTestId('timer-minutes-input').fill('5')
    await pg.getByTestId('timer-start-btn').click()

    // Layout 2 colonnes : Peur en colonne 1, minuteur en colonne 2
    await pg.getByTestId('dashboard-layout-select').selectOption('2-col')
    await pg.getByTestId('dashboard-slot-col-1').selectOption({ label: 'Peur' })
    await pg.getByTestId('dashboard-slot-col-2').selectOption('timer')
    await pg.getByTestId('dashboard-apply-btn').click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'dashboard', { timeout: 8_000 })
    await expect(tvPage.page.getByTestId('tv-mode-dashboard')).toBeVisible({ timeout: 8_000 })
    await expect(tvPage.page.getByText('Peur')).toBeVisible({ timeout: 8_000 })
    await expect(tvPage.page.getByTestId('tv-widget-timer')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('starting the doom clock while the dashboard is shown does not eject it', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('tension')
    const pg = adminPage.page

    await createGauge(adminPage, 'Vagues du siège', 5)
    await pg.getByTestId('dashboard-layout-select').selectOption('2-col')
    await pg.getByTestId('dashboard-slot-col-1').selectOption({ label: 'Vagues du siège' })
    await pg.getByTestId('dashboard-apply-btn').click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'dashboard', { timeout: 8_000 })

    // Lancer le Doom Clock pendant que le dashboard est affiché : ne doit pas basculer
    // tv_mode vers 'doom' (voir la garde CASE WHEN tv_mode = 'dashboard' dans socket.js).
    const doomSection = pg.locator('.control-section').filter({ hasText: /doom clock/i })
    await doomSection.locator('input[type="number"]').first().fill('1')
    await doomSection.locator('button.action-btn').filter({ hasText: 'Lancer' }).click()

    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'dashboard', { timeout: 5_000 })
    await expect(tvPage.page.getByTestId('tv-mode-dashboard')).toBeVisible()
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
