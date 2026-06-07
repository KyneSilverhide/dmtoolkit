import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

async function createTimeScale(
  adminPage: AdminPage,
  opts: { title?: string; totalHours?: number; slotCount?: number; restSlots?: number } = {}
) {
  const { title = 'Journée', totalHours = 12, slotCount = 4, restSlots = 2 } = opts
  await adminPage.switchTab('tension')
  const pg = adminPage.page

  const timescaleSection = pg.locator('.control-section').filter({ hasText: /Échelle de temps/i })
  await timescaleSection.locator('input[type="text"]').fill(title)

  const numbers = timescaleSection.locator('input[type="number"]')
  await numbers.nth(0).fill(String(totalHours))
  await numbers.nth(1).fill(String(slotCount))
  await numbers.nth(2).fill(String(restSlots))

  await timescaleSection.locator('button.action-btn').filter({ hasText: /Créer|Recréer/i }).click()
}

test('admin creates a time scale and TV switches to timescale mode', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await createTimeScale(adminPage, { title: 'Expédition', totalHours: 8, slotCount: 4, restSlots: 2 })

    await expect(tvPage.page.getByTestId('tv-mode-timescale')).toBeVisible({ timeout: 8_000 })
    expect(await tvPage.getCurrentMode()).toBe('timescale')
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin advances time scale by one slot and status updates', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createTimeScale(adminPage, { title: 'Marche', totalHours: 6, slotCount: 3, restSlots: 1 })

    const timescaleSection = adminPage.page.locator('.control-section').filter({ hasText: /Échelle de temps/i })
    const statusLine = timescaleSection.locator('.status-line')
    await expect(statusLine).toBeVisible({ timeout: 5_000 })
    const before = await statusLine.textContent()

    await timescaleSection.locator('button.action-btn').filter({ hasText: /\+1 palier/i }).click()

    // Status line should change (elapsed slots incremented)
    await expect(async () => {
      const after = await statusLine.textContent()
      expect(after).not.toBe(before)
    }).toPass({ timeout: 6_000 })
  } finally {
    await adminCtx.close()
  }
})

test('long rest advances multiple slots and disables itself after', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // 6 paliers, repos long = 2 paliers
    await createTimeScale(adminPage, { title: 'Nuit', totalHours: 12, slotCount: 6, restSlots: 2 })

    const timescaleSection = adminPage.page.locator('.control-section').filter({ hasText: /Échelle de temps/i })
    const restBtn = timescaleSection.locator('button.action-btn').filter({ hasText: /Repos long/i })

    // Repos long should be available initially
    await expect(restBtn).toBeEnabled({ timeout: 5_000 })
    await restBtn.click()

    // After long rest, status shows "Repos long déjà pris" warning
    await expect(timescaleSection.locator('.warn-hint').filter({ hasText: /Repos long déjà pris/i })).toBeVisible({ timeout: 6_000 })
    // Button should be disabled
    await expect(restBtn).toBeDisabled()
  } finally {
    await adminCtx.close()
  }
})

test('admin ends time scale and TV returns to lobby', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await createTimeScale(adminPage, { title: 'Traversée', totalHours: 4, slotCount: 2, restSlots: 1 })
    await expect(tvPage.page.getByTestId('tv-mode-timescale')).toBeVisible({ timeout: 8_000 })

    const timescaleSection = adminPage.page.locator('.control-section').filter({ hasText: /Échelle de temps/i })
    await timescaleSection.locator('button.action-btn').filter({ hasText: /Terminer/i }).click()

    await expect(tvPage.getLobbyDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
