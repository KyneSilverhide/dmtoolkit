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

test('combat round increments and TV shows updated value', async ({ browser }) => {
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

    await adminPage.switchTab('tension')
    await adminPage.page.locator('button.action-btn').filter({ hasText: '+1' }).first().click()

    // TV combat round badge should show 1
    await expect(tvPage.getCombatRound()).toContainText('1', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('combat round decrements (not below 0)', async ({ browser }) => {
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

    await adminPage.switchTab('tension')
    // Increment to 2
    await adminPage.page.locator('button.action-btn').filter({ hasText: '+1' }).first().click()
    await adminPage.page.locator('button.action-btn').filter({ hasText: '+1' }).first().click()
    await expect(tvPage.getCombatRound()).toContainText('2', { timeout: 8_000 })

    // Decrement back to 1
    await adminPage.page.locator('button.action-btn').filter({ hasText: '−1' }).first().click()
    await expect(tvPage.getCombatRound()).toContainText('1', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('reset combat round returns to 0', async ({ browser }) => {
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

    await adminPage.switchTab('tension')
    await adminPage.page.locator('button.action-btn').filter({ hasText: '+1' }).first().click()
    await adminPage.page.locator('button.action-btn').filter({ hasText: '+1' }).first().click()
    await expect(tvPage.getCombatRound()).toContainText('2', { timeout: 8_000 })

    // Reset
    await adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: 'Réinitialiser' }).click()
    await expect(tvPage.getCombatRound()).toContainText('0', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
