import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

async function startTimer(adminPage: AdminPage, minutes = 0, seconds = 30, label = 'Minuteur') {
  await adminPage.switchTab('tension')
  const pg = adminPage.page

  // Wait for the timer inputs to be visible (tab transition may be in progress)
  await pg.getByTestId('timer-label-input').fill(label)
  await pg.getByTestId('timer-minutes-input').fill(String(minutes))
  await pg.getByTestId('timer-seconds-input').fill(String(seconds))
  await pg.getByTestId('timer-start-btn').click()
}

test('admin starts a timer and it shows on TV in combat mode', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
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

test('timer counts down on TV', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.setTvMode('combat')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startTimer(adminPage, 0, 15)

    const timerEl = tvPage.page.locator('[class*="timer"], [class*="countdown"]').first()
    await expect(timerEl).toBeVisible({ timeout: 8_000 })
    const t1 = await timerEl.textContent()
    await tvPage.page.waitForTimeout(2_000)
    const t2 = await timerEl.textContent()
    expect(t1).not.toBe(t2)
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can stop the timer', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await startTimer(adminPage, 0, 30)

    // Stop button should become enabled after starting
    const stopBtn = adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: 'Arrêter' }).nth(1)
    await expect(stopBtn).not.toBeDisabled({ timeout: 8_000 })
    await stopBtn.click()

    // Stop button should be disabled again
    await expect(stopBtn).toBeDisabled({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('timer label is displayed', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.setTvMode('combat')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    await startTimer(adminPage, 1, 0, 'Décision finale')

    await expect(tvPage.page.getByText(/Décision finale/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
