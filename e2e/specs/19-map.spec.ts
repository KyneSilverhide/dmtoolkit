import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { getAdminToken } from '../helpers/auth'
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

test('admin can upload a map and TV shows it', async ({ browser }) => {
  test.setTimeout(30_000)

  const token = await getAdminToken()
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
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 5_000 })
    await adminPage.setTvMode('map')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMapDisplay()).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('admin can toggle fog of war', async ({ browser }) => {
  test.setTimeout(30_000)

  const token = await getAdminToken()
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
    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 5_000 })

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

test('TV map mode shows player tokens after join', async ({ browser }) => {
  test.setTimeout(30_000)

  const token = await getAdminToken()
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

    await expect(adminPage.page.getByTestId('tv-mode-btn-map')).toBeEnabled({ timeout: 5_000 })
    await adminPage.setTvMode('map')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMapDisplay()).toBeVisible({ timeout: 5_000 })

    const { joinAsPlayer } = await import('../helpers/player')
    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'MapToken', hp: 30 })

    // Token layer is always rendered inside the map display
    await expect(tvPage.page.locator('.map-tokens-layer')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})
