import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache, loginAsAdmin } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

test('player join form navigates to player view', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Legolas' })
  await expect(page).toHaveURL(/\/view\//)
})

test('player join form fills session code from URL', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await page.goto(`/join/${code}`)
  await expect(page.getByTestId('session-code-input')).toHaveValue(code)
})

test('player appears in admin list after joining', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPage = await playerCtx.newPage()
    await joinAsPlayer(playerPage, code, { name: 'Gimli', hp: 50 })

    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('player appears on TV player list after joining', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    // Switch to combat mode so players are displayed
    const adminCtx = await browser.newContext()
    const adminPg = new AdminPage(await adminCtx.newPage())
    await adminPg.login(token)
    await adminPg.page.getByText(code).first().click()
    await adminPg.setTvMode('combat')

    const playerPage = await playerCtx.newPage()
    await joinAsPlayer(playerPage, code, { name: 'Aragorn', hp: 60 })

    await expect(tvPage.page.getByText('Aragorn')).toBeVisible({ timeout: 10_000 })

    await adminCtx.close()
  } finally {
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('kicking player removes them from admin list', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPage = await playerCtx.newPage()
    await joinAsPlayer(playerPage, code, { name: 'Frodo', hp: 30 })

    // Find player id from the DOM
    const playerRow = adminPage.page.locator('[data-testid^="player-row-"]').first()
    await expect(playerRow).toBeVisible({ timeout: 10_000 })
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    await adminPage.kickPlayer(playerId)
    await expect(adminPage.page.getByTestId(`player-row-${playerId}`)).not.toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('kicked player sees kicked screen', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPage = await playerCtx.newPage()
    await joinAsPlayer(playerPage, code, { name: 'Sam', hp: 35 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    const playerRow = adminPage.page.locator('[data-testid^="player-row-"]').first()
    const testId = await playerRow.getAttribute('data-testid')
    const playerId = Number(testId?.replace('player-row-', ''))

    await adminPage.kickPlayer(playerId)
    await expect(playerPage.getByText(/expulsé|kicked/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
