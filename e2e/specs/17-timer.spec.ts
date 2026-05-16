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

async function startTimer(adminPage: AdminPage, minutes = 0, seconds = 30, label = 'Minuteur') {
  await adminPage.switchTab('tension')
  const pg = adminPage.page
  const labelEl = pg.locator('input[placeholder*="Minuteur" i], input[placeholder*="timer" i]').first()
  if (await labelEl.count()) await labelEl.fill(label)

  // Timer minute and second inputs (find them after doom clock inputs)
  const numberInputs = pg.locator('input[type="number"]')
  const count = await numberInputs.count()
  if (count >= 4) {
    await numberInputs.nth(2).fill(String(minutes))
    await numberInputs.nth(3).fill(String(seconds))
  }

  await pg.locator('button.action-btn').filter({ hasText: 'Démarrer' }).click()
}

test('admin starts a timer and it shows on TV in combat mode', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.setTvMode('combat')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startTimer(adminPage, 0, 30, 'Temps de réflexion')

    // Timer should appear on TV (in combat mode, shown as overlay)
    await expect(tvPage.page.getByText(/Temps de réflexion|minuteur|timer/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('timer counts down on TV', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.setTvMode('combat')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startTimer(adminPage, 0, 15)

    const timerEl = tvPage.page.locator('[class*="timer"], [class*="countdown"]').first()
    await expect(timerEl).toBeVisible({ timeout: 10_000 })
    const t1 = await timerEl.textContent()
    await tvPage.page.waitForTimeout(2_000)
    const t2 = await timerEl.textContent()
    expect(t1).not.toBe(t2)
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can stop the timer', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await startTimer(adminPage, 0, 30)

    // Stop button should become enabled after starting
    const stopBtn = adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: 'Arrêter' }).nth(1)
    await expect(stopBtn).not.toBeDisabled({ timeout: 5_000 })
    await stopBtn.click()

    // Stop button should be disabled again
    await expect(stopBtn).toBeDisabled({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
  }
})

test('timer label is displayed', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.setTvMode('combat')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startTimer(adminPage, 1, 0, 'Décision finale')

    await expect(tvPage.page.getByText(/Décision finale/i)).toBeVisible({ timeout: 10_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
