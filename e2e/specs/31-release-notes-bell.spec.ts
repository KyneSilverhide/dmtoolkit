import { test, expect } from '../fixtures'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

test('GET /api/release-notes returns 200 with notes array', async () => {
  const res = await fetch(`${BACKEND_URL}/api/release-notes`)
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data).toHaveProperty('notes')
  expect(Array.isArray(data.notes)).toBe(true)
  expect(data.notes.length).toBeGreaterThan(0)
  // Each entry should have version, date, changes
  const first = data.notes[0]
  expect(first).toHaveProperty('version')
  expect(first).toHaveProperty('changes')
})

test('release notes bell is visible on home page', async ({ page }) => {
  await page.goto('/')
  // The banner variant or icon variant of the bell should be visible
  await expect(page.locator('.rn-bell-btn, .rn-banner-btn').first()).toBeVisible({ timeout: 6_000 })
})

test('clicking the release notes bell opens the modal', async ({ page }) => {
  await page.goto('/')
  const bellBtn = page.locator('.rn-bell-btn, .rn-banner-btn').first()
  await expect(bellBtn).toBeVisible({ timeout: 6_000 })
  await bellBtn.click()

  // Modal card should appear
  await expect(page.locator('.rn-card')).toBeVisible({ timeout: 6_000 })
})

test('release notes modal shows version entries', async ({ page }) => {
  await page.goto('/')
  const bellBtn = page.locator('.rn-bell-btn, .rn-banner-btn').first()
  await bellBtn.click()

  // Should display at least one version entry
  await expect(page.locator('.rn-version').first()).toBeVisible({ timeout: 6_000 })
})
