import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'

async function createFaction(adminPage: AdminPage, name: string) {
  await adminPage.switchTab('reputation')
  const root = adminPage.page.locator('.reputation-manager')
  await root.locator('input[type="text"]').fill(name)
  await root.locator('button.action-btn').filter({ hasText: 'Ajouter' }).click()
  await expect(root.locator('.faction-card').filter({ hasText: name })).toBeVisible({ timeout: 6_000 })
}

test('admin creates a faction and it appears in the list', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createFaction(adminPage, 'Garde de la Ville')

    const root = adminPage.page.locator('.reputation-manager')
    const card = root.locator('.faction-card').filter({ hasText: 'Garde de la Ville' })
    await expect(card.locator('.fc-name')).toContainText('Garde de la Ville')
    await expect(card.locator('.fc-value')).toContainText('+0')
  } finally {
    await adminCtx.close()
  }
})

test('admin adjusts faction value and display updates', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createFaction(adminPage, 'Marchands')

    const root = adminPage.page.locator('.reputation-manager')
    const card = root.locator('.faction-card').filter({ hasText: 'Marchands' })
    await card.locator('.adj-btn--plus').click()

    await expect(card.locator('.fc-value')).toContainText('+1', { timeout: 6_000 })
  } finally {
    await adminCtx.close()
  }
})

test('admin deletes a faction and it disappears', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createFaction(adminPage, 'Voleurs')

    const root = adminPage.page.locator('.reputation-manager')
    const card = root.locator('.faction-card').filter({ hasText: 'Voleurs' })
    await card.locator('.remove-btn').click()

    await expect(card).not.toBeVisible({ timeout: 6_000 })
  } finally {
    await adminCtx.close()
  }
})

test('admin projects reputation to TV and factions are visible', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createFaction(adminPage, 'Église du Soleil')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    const root = adminPage.page.locator('.reputation-manager')
    await root.locator('button.action-btn.primary').filter({ hasText: 'Projeter sur TV' }).click()

    await expect(tvPage.getReputationDisplay()).toBeVisible({ timeout: 8_000 })
    await expect(tvPage.page.locator('.tv-faction-name').filter({ hasText: 'Église du Soleil' })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('reputation toast appears on TV when value changes in lobby mode', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createFaction(adminPage, 'Noblesse')

    // TV must be connected before the value changes so the socket event is received
    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    const root = adminPage.page.locator('.reputation-manager')
    const card = root.locator('.faction-card').filter({ hasText: 'Noblesse' })
    await card.locator('.adj-btn--plus').click()

    await expect(tvPage.getReputationToast()).toBeVisible({ timeout: 8_000 })
    await expect(tvPage.page.locator('.rep-toast-faction')).toContainText('Noblesse', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
