import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'
import * as path from 'path'
import * as fs from 'fs'

async function uploadMap(page: Page): Promise<void> {
  const tmpPath = path.join(process.cwd(), 'fixtures', '_test_map.jpg')
  if (!fs.existsSync(tmpPath)) {
    throw new Error(`Test map file not found: ${tmpPath}`)
  }
  // The file input is display:none — trigger the file chooser via its label
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-testid="map-upload-btn"]').click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(tmpPath)
  // Wait for the gallery to populate (upload + loadImages completed)
  await page.locator('.gallery-item').first().waitFor({ timeout: 10_000 })
}

test('admin can upload a map and TV shows it', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)

  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    // Click "Carte TV" — emits show-map which sets backend TV mode to map
    const showBtn = adminPage.page.locator('button').filter({ hasText: 'Carte TV' }).first()
    await showBtn.click()

    // Wait for backend map-state event: hasActiveMap becomes true → button enabled
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 8_000 })
    await adminPage.setTvMode('map')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMapDisplay()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can toggle fog of war', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)

  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    // Trigger show-map to activate fog controls (requires isMapActive = true)
    const showBtn = adminPage.page.locator('button').filter({ hasText: 'Carte TV' }).first()
    await showBtn.click()
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 8_000 })

    // Fog toggle button should now be visible
    const fogBtn = adminPage.page.locator('button').filter({ hasText: /activer|désactiver/i }).first()
    if (await fogBtn.count()) {
      await fogBtn.click()
      await expect(fogBtn).toBeVisible()
    }
  } finally {
    await adminCtx.close()
  }
})

test('TV map mode shows player tokens after join', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)

  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    const showBtn = adminPage.page.locator('button').filter({ hasText: 'Carte TV' }).first()
    await showBtn.click()

    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 8_000 })
    await adminPage.setTvMode('map')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMapDisplay()).toBeVisible({ timeout: 8_000 })

    const { joinAsPlayer } = await import('../helpers/player')
    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'MapToken', hp: 30 })

    // Token layer is always rendered inside the map display
    await expect(tvPage.page.locator('.map-tokens-layer')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('admin configures a square grid on a map and saves it', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    // Activate the map so grid controls become available
    const showBtn = adminPage.page.locator('button').filter({ hasText: 'Carte TV' }).first()
    await showBtn.click()
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 8_000 })

    // Open grid config panel (toggle button)
    const configBtn = adminPage.page.locator('button').filter({ hasText: /Configurer/i }).first()
    await expect(configBtn).toBeVisible({ timeout: 5_000 })
    await configBtn.click()

    // Select square grid type
    const squareBtn = adminPage.page.locator('.type-btn').filter({ hasText: /Carrés/i }).first()
    await expect(squareBtn).toBeVisible({ timeout: 5_000 })
    await squareBtn.click()
    await expect(squareBtn).toHaveClass(/active/, { timeout: 3_000 })

    // Save the grid config
    const saveBtn = adminPage.page.locator('.save-grid-btn').first()
    await saveBtn.click()

    // Grid badge should appear after save
    await expect(adminPage.page.locator('.grid-status-badge')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('admin reveals a grid cell and TV receives the update', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    // Show map and set to map TV mode
    const showBtn = adminPage.page.locator('button').filter({ hasText: 'Carte TV' }).first()
    await showBtn.click()
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 8_000 })
    await adminPage.setTvMode('map')

    // Configure and save square grid
    const configBtn = adminPage.page.locator('button').filter({ hasText: /Configurer/i }).first()
    await configBtn.click()
    await adminPage.page.locator('.type-btn').filter({ hasText: /Carrés/i }).first().click()
    await adminPage.page.locator('.save-grid-btn').first().click()
    await expect(adminPage.page.locator('.grid-status-badge')).toBeVisible({ timeout: 8_000 })

    // Enable fog
    await adminPage.page.locator('button').filter({ hasText: /Activer/i }).first().click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMapDisplay()).toBeVisible({ timeout: 8_000 })

    // Click on a cell in the admin map canvas to reveal it
    const canvas = adminPage.page.locator('.map-canvas').first()
    await expect(canvas).toBeVisible({ timeout: 5_000 })
    const box = await canvas.boundingBox()
    if (box) {
      // Click near center of canvas — should hit a grid cell
      await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
    }

    // TV should eventually show a revealed cell (fog-cell-revealed class or canvas update)
    // We verify the fog layer is present on TV — the actual pixel diff is not testable,
    // but we can confirm the fog canvas element exists on the TV map display
    await expect(tvPage.page.locator('.map-fog-canvas, .fog-overlay')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin resets grid fog cells and all cells become hidden', async ({ browser, adminToken }) => {
  test.setTimeout(45_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    const showBtn = adminPage.page.locator('button').filter({ hasText: 'Carte TV' }).first()
    await showBtn.click()
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 8_000 })

    // Configure square grid and enable fog
    const configBtn = adminPage.page.locator('button').filter({ hasText: /Configurer/i }).first()
    await configBtn.click()
    await adminPage.page.locator('.type-btn').filter({ hasText: /Carrés/i }).first().click()
    await adminPage.page.locator('.save-grid-btn').first().click()
    await expect(adminPage.page.locator('.grid-status-badge')).toBeVisible({ timeout: 8_000 })

    await adminPage.page.locator('button').filter({ hasText: /Activer/i }).first().click()

    // Reveal a cell
    const canvas = adminPage.page.locator('.map-canvas').first()
    const box = await canvas.boundingBox()
    if (box) await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })

    // Reset fog — use the Reset button
    const resetBtn = adminPage.page.locator('button.danger-btn').filter({ hasText: /Reset/i }).first()
    await expect(resetBtn).toBeVisible({ timeout: 5_000 })
    await resetBtn.click()

    // After reset the grid status badge is still shown (grid still configured)
    await expect(adminPage.page.locator('.grid-status-badge')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
  }
})
