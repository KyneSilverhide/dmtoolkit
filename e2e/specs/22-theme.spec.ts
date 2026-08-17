import { test, expect } from '../fixtures'
import { loginAsAdmin } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'

// Depuis la refonte UI, le thème se choisit dans un sélecteur explicite (ThemePicker.vue) :
// une entrée par thème, atteignable en un clic, au lieu d'un bouton de cycle. Le thème
// 'light' a été supprimé — voir docs/refonte-ui.md §3.1.1.

function readPrefs(page: import('@playwright/test').Page, key: string) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem('cf_theme_preferences') || '{}')[k] ?? null } catch { return null }
  }, key)
}

test('admin can pick a theme directly and the preference persists', async ({ page, adminToken }) => {
  await loginAsAdmin(page, adminToken)

  // Un clic suffit pour atteindre un thème donné — c'est tout l'intérêt du sélecteur.
  await page.getByTestId('theme-option-nacre').click()
  expect(await readPrefs(page, 'admin')).toBe('nacre')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacre')

  await page.getByTestId('theme-option-arcane').click()
  expect(await readPrefs(page, 'admin')).toBe('arcane')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arcane')
})

test('the selected theme is marked as pressed', async ({ page, adminToken }) => {
  await loginAsAdmin(page, adminToken)

  await page.getByTestId('theme-option-sceau').click()
  await expect(page.getByTestId('theme-option-sceau')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('theme-option-dark')).toHaveAttribute('aria-pressed', 'false')
})

test('theme persists after page reload', async ({ page, adminToken }) => {
  await loginAsAdmin(page, adminToken)

  await page.getByTestId('theme-option-sceau').click()
  const themeAfterPick = await readPrefs(page, 'admin')

  await page.reload()
  await page.waitForURL('/admin')

  expect(await readPrefs(page, 'admin')).toBe(themeAfterPick)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sceau')
})

test('home page uses last used theme from any scope', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    try {
      localStorage.setItem('cf_theme_preferences', JSON.stringify({ player: 'nacre', _last: 'nacre' }))
    } catch {}
  })

  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacre')
})

test('a stored "light" preference is remapped to sceau, not to dark', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    try {
      localStorage.setItem('cf_theme_preferences', JSON.stringify({ player: 'light', _last: 'light' }))
    } catch {}
  })

  await page.goto('/')
  // 'sceau' est un autre thème CLAIR : l'utilisateur ne bascule pas brutalement en noir.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sceau')
})

test('admin can switch display density', async ({ page, adminToken }) => {
  await loginAsAdmin(page, adminToken)

  await page.getByTestId('density-option-confortable').click()
  await expect(page.locator('html')).toHaveAttribute('data-density', 'confortable')
  expect(await readPrefs(page, 'density:admin')).toBe('confortable')

  // La densité ne touche pas le thème, et réciproquement.
  await page.getByTestId('theme-option-arcane').click()
  await expect(page.locator('html')).toHaveAttribute('data-density', 'confortable')
  expect(await readPrefs(page, 'admin')).toBe('arcane')

  await page.reload()
  await page.waitForURL('/admin')
  await expect(page.locator('html')).toHaveAttribute('data-density', 'confortable')
})

test('player can pick a theme and a density from the header menu', async ({ page, adminToken }) => {
  const code = await createSession(adminToken)
  await joinAsPlayer(page, code, { name: 'Themed', hp: 20 })

  await page.getByTestId('header-menu-btn').click()

  await page.getByTestId('theme-option-arcane').click()
  expect(await readPrefs(page, 'player')).toBe('arcane')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'arcane')

  await page.getByTestId('density-option-confortable').click()
  expect(await readPrefs(page, 'density:player')).toBe('confortable')
  await expect(page.locator('html')).toHaveAttribute('data-density', 'confortable')
})
