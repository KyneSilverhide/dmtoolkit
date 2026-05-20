import { test, expect } from '../fixtures'
import { getAdminToken, loginAsAdmin } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'

test('admin can toggle theme and preference persists', async ({ page }) => {
  const token = await getAdminToken()
  await loginAsAdmin(page, token)

  const toggleBtn = page.getByTestId('theme-toggle')
  await expect(toggleBtn).toBeVisible()

  // Read initial theme
  const initialTheme = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cf_theme_preferences') || '{}').admin || 'dark' } catch { return 'dark' }
  })

  await toggleBtn.click()

  const newTheme = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cf_theme_preferences') || '{}').admin || 'dark' } catch { return 'dark' }
  })

  expect(newTheme).not.toBe(initialTheme)
})

test('theme persists after page reload', async ({ page }) => {
  const token = await getAdminToken()
  await loginAsAdmin(page, token)

  // Toggle to light
  const toggleBtn = page.getByTestId('theme-toggle')
  await toggleBtn.click()

  const themeAfterToggle = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cf_theme_preferences') || '{}').admin } catch { return null }
  })

  await page.reload()
  await page.waitForURL('/admin')

  const themeAfterReload = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cf_theme_preferences') || '{}').admin } catch { return null }
  })

  expect(themeAfterReload).toBe(themeAfterToggle)
})

test('home page uses last used theme from any scope', async ({ page }) => {
  // Set player theme to light
  await page.goto('/')
  await page.evaluate(() => {
    try {
      const prefs = { player: 'light', _last: 'light' }
      localStorage.setItem('cf_theme_preferences', JSON.stringify(prefs))
    } catch {}
  })

  await page.goto('/')
  const htmlClass = await page.locator('html').getAttribute('data-theme')
  // Should be light (last used)
  expect(htmlClass).toBe('light')
})

test('player theme toggle works', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Themed', hp: 20 })

  // The theme toggle is inside the hamburger menu — open it first
  await page.getByTestId('header-menu-btn').click()

  const toggleBtn = page.getByTestId('player-theme-toggle')
  await expect(toggleBtn).toBeVisible()

  await toggleBtn.click()

  const newTheme = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cf_theme_preferences') || '{}').player } catch { return null }
  })
  expect(['light', 'dark']).toContain(newTheme)
})
