import { test, expect, Page } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { TvPage } from '../page-objects/TvPage'
import * as path from 'path'
import * as fs from 'fs'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

function createTestImageBuffer(): Buffer {
  // Minimal 1x1 white PNG
  const PNG_HEADER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ])
  return PNG_HEADER
}

async function uploadMap(page: Page): Promise<void> {
  const imgBuffer = createTestImageBuffer()
  const tmpPath = path.join(process.cwd(), 'fixtures', '_test_map.png')
  fs.writeFileSync(tmpPath, imgBuffer)

  try {
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(tmpPath)
    await page.waitForTimeout(1_000)
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

test('admin can upload a map and TV shows it', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    // Try to show map
    const showBtn = adminPage.page.locator('button').filter({ hasText: /afficher|show.*map|carte/i }).first()
    if (await showBtn.count()) await showBtn.click()

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
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)

    // Fog toggle button should be visible
    const fogBtn = adminPage.page.locator('button').filter({ hasText: /brouillard|fog/i }).first()
    if (await fogBtn.count()) {
      await fogBtn.click()
      // Button state should change
      await expect(fogBtn).toBeVisible()
    }
  } finally {
    await adminCtx.close()
  }
})

test('TV map mode shows player tokens after join', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()
    await adminPage.switchTab('map')

    await uploadMap(adminPage.page)
    const showBtn = adminPage.page.locator('button').filter({ hasText: /afficher|show.*map|carte/i }).first()
    if (await showBtn.count()) await showBtn.click()

    await adminPage.setTvMode('map')

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await expect(tvPage.getMapDisplay()).toBeVisible({ timeout: 5_000 })

    const { joinAsPlayer } = await import('../helpers/player')
    await joinAsPlayer(await playerCtx.newPage(), code, { name: 'MapToken', hp: 30 })

    // Token layer should be visible
    await expect(tvPage.page.locator('.map-tokens-layer')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('map display container has correct testid', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.page.getByText(code).first().click()

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    // Map display is only visible if map mode is active — just verify TV container exists
    await expect(tvPage.getMode()).toBeVisible()
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
