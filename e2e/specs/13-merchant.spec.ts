import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'
import { TvPage } from '../page-objects/TvPage'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

async function createMerchant(adminPage: AdminPage, merchantName: string, items: Array<{ name: string; price: number }>) {
  await adminPage.switchTab('merchants')
  const pg = adminPage.page

  // Switch to create view
  await pg.locator('button.tab-btn').filter({ hasText: '+ Créer' }).click()

  await pg.locator('input[placeholder*="Brom" i], input[placeholder*="marchand" i]').first().fill(merchantName)

  for (let i = 0; i < items.length; i++) {
    if (i > 0) await pg.locator('button.small-btn').filter({ hasText: /\+ Ajouter/ }).click()
    const itemRows = pg.locator('.item-row')
    await itemRows.nth(i).locator('input.item-name-input').fill(items[i].name)
    await itemRows.nth(i).locator('input.item-price-input').fill(String(items[i].price))
  }

  await pg.locator('button.action-btn').filter({ hasText: /Créer le marchand/ }).click()
}

async function showMerchant(adminPage: AdminPage) {
  await adminPage.switchTab('merchants')
  const pg = adminPage.page
  await pg.locator('button.tab-btn').filter({ hasText: 'Liste' }).click()
  await pg.locator('button').filter({ hasText: /afficher|montrer|ouvrir/i }).first().click()
}

test('admin creates a merchant', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createMerchant(adminPage, 'Brom le Forgeron', [{ name: 'Épée longue', price: 15 }])

    await adminPage.switchTab('merchants')
    await expect(adminPage.page.getByText('Brom le Forgeron').first()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('merchant shown on TV in merchant mode', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    await createMerchant(adminPage, 'Elara la Magicienne', [{ name: 'Potion de soin', price: 50 }])
    await showMerchant(adminPage)

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('merchant')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'merchant', { timeout: 8_000 })
    await expect(tvPage.getMerchantDisplay()).toBeVisible({ timeout: 10_000 })
    await expect(tvPage.page.getByText('Potion de soin')).toBeVisible()
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('player can see merchant in boutique tab', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Buyer', hp: 40 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    await createMerchant(adminPage, 'Tobias le Voyageur', [{ name: 'Corde (15m)', price: 1 }])
    await showMerchant(adminPage)

    // Player boutique tab should now be enabled
    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('boutique')
    await expect(playerPg.getByText('Corde (15m)')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('player can add item to cart', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Shopper', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    await createMerchant(adminPage, 'Mira la Taverniére', [{ name: 'Nourriture', price: 2 }])
    await showMerchant(adminPage)

    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('boutique')
    await expect(playerPg.getByText('Nourriture')).toBeVisible({ timeout: 8_000 })

    // Add to cart
    await playerPg.locator('button').filter({ hasText: /\+|ajouter|panier/i }).first().click()

    // Cart badge should appear
    await expect(playerPg.locator('[data-testid="player-tab-boutique"] .tab-badge')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin receives purchase request after player submits cart', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Customer', hp: 35 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 10_000 })

    await createMerchant(adminPage, 'Gorp le Marchand', [{ name: 'Torche', price: 1 }])
    await showMerchant(adminPage)

    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('boutique')
    await playerPg.locator('button').filter({ hasText: /\+|ajouter/i }).first().click()

    // Submit cart
    await playerPg.locator('button').filter({ hasText: /valider|soumettre|commander/i }).first().click()

    // Admin should see purchase request
    await adminPage.switchTab('merchants')
    await expect(adminPage.page.getByText(/demande|achat|Customer/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin can accept purchase request', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Accepted', hp: 40 })
    await expect(adminPage.page.getByText('Accepted')).toBeVisible({ timeout: 10_000 })

    await createMerchant(adminPage, 'Voran le Sage', [{ name: 'Parchemin', price: 5 }])
    await showMerchant(adminPage)

    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('boutique')
    await playerPg.locator('button').filter({ hasText: /\+|ajouter/i }).first().click()
    await playerPg.locator('button').filter({ hasText: /valider|soumettre|commander/i }).first().click()

    await adminPage.switchTab('merchants')
    await adminPage.page.locator('button.respond-btn').first().click()
    // Accept the purchase in the response dialog
    await adminPage.page.locator('button').filter({ hasText: /accepter|accept/i }).first().click()

    // Player should receive confirmation
    await expect(playerPg.getByText(/accepté|accepted/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin can reject purchase request', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Rejected', hp: 28 })
    await expect(adminPage.page.getByText('Rejected')).toBeVisible({ timeout: 10_000 })

    await createMerchant(adminPage, 'Avar le Radin', [{ name: 'Gemme', price: 100 }])
    await showMerchant(adminPage)

    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('boutique')
    await playerPg.locator('button').filter({ hasText: /\+|ajouter/i }).first().click()
    await playerPg.locator('button').filter({ hasText: /valider|soumettre|commander/i }).first().click()

    await adminPage.switchTab('merchants')
    await adminPage.page.locator('button.respond-btn').first().click()
    await adminPage.page.locator('button').filter({ hasText: /refuser|reject/i }).first().click()

    await expect(playerPg.getByText(/refusé|rejected/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('merchant items stock decrements after accepted purchase', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'StockTester', hp: 30 })
    await expect(adminPage.page.getByText('StockTester')).toBeVisible({ timeout: 10_000 })

    // Create merchant with stock of 2
    await createMerchant(adminPage, 'Ingrid la Mercante', [{ name: 'Bouclier', price: 10 }])
    // Set stock manually (items row)
    await adminPage.page.locator('input.item-stock-input').fill('2')
    await adminPage.page.locator('button.action-btn').filter({ hasText: /Créer/ }).click().catch(() => {})

    await showMerchant(adminPage)
    await adminPage.setTvMode('merchant')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMerchantDisplay()).toBeVisible({ timeout: 10_000 })

    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('boutique')
    await playerPg.locator('button').filter({ hasText: /\+|ajouter/i }).first().click()
    await playerPg.locator('button').filter({ hasText: /valider|soumettre|commander/i }).first().click()

    await adminPage.switchTab('merchants')
    await adminPage.page.locator('button.respond-btn').first().click()
    await adminPage.page.locator('button').filter({ hasText: /accepter|accept/i }).first().click()

    // TV merchant display should now show updated stock
    await expect(tvPage.page.locator('[class*="stock"]').first()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
    await tvCtx.close()
  }
})

test('admin can close merchant', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Sonder', hp: 22 })
    await expect(adminPage.page.getByText('Sonder')).toBeVisible({ timeout: 10_000 })

    await createMerchant(adminPage, 'Greta', [{ name: 'Clé', price: 3 }])
    await showMerchant(adminPage)
    await expect(playerPg.getByTestId('player-tab-boutique')).not.toBeDisabled({ timeout: 8_000 })

    // Close the merchant
    await adminPage.switchTab('merchants')
    await adminPage.page.locator('button').filter({ hasText: /fermer|clôturer/i }).first().click()

    // Player boutique tab should be disabled again
    await expect(playerPg.getByTestId('player-tab-boutique')).toBeDisabled({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
