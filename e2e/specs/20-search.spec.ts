import { test, expect } from '../fixtures'
import { getAdminToken } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'

test('spell search returns results for known spell', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('search')

    // Search for a known D&D 5e spell
    const searchInput = adminPage.page.locator('input[placeholder*="sort" i], input[placeholder*="spell" i], input[placeholder*="recherche" i]').first()
    await searchInput.fill('boule de feu')
    await adminPage.page.keyboard.press('Enter')

    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*boule de feu\s*$/i })).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
  }
})

test('spell search shows no results for unknown spell', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('search')

    const searchInput = adminPage.page.locator('input[placeholder*="sort" i], input[placeholder*="spell" i], input[placeholder*="recherche" i]').first()
    await searchInput.fill('xyzzy_nonexistent_spell_xyz')
    await adminPage.page.keyboard.press('Enter')

    await expect(adminPage.page.getByText(/aucun sort trouvé/i)).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
  }
})

test('player sorts tab has spell search', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const { joinAsPlayer } = await import('../helpers/player')
  await joinAsPlayer(page, code, { name: 'Mage', hp: 24 })

  await page.getByTestId('player-tab-sorts').click()

  // Spell search input should be visible
  const searchInput = page.locator('input[placeholder*="sort" i], input[placeholder*="spell" i], input[placeholder*="recherche" i]').first()
  await expect(searchInput).toBeVisible({ timeout: 5_000 })
})

test('magic item search returns results', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('search')

    // Switch to magic items search tab if exists
    const magicTab = adminPage.page.locator('button').filter({ hasText: /objet magique|magic item/i }).first()
    if (await magicTab.count()) {
      await magicTab.click()
      const searchInput = adminPage.page.locator('input[placeholder*="objet" i], input[placeholder*="item" i]').first()
      await searchInput.fill('épée')
      await adminPage.page.keyboard.press('Enter')
      await expect(adminPage.page.locator('[class*="result"], [class*="item"]').first()).toBeVisible({ timeout: 5_000 })
    }
  } finally {
    await adminCtx.close()
  }
})
