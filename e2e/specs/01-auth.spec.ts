import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache, loginAsAdmin } from '../helpers/auth'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

test('DM login button opens modal', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dm-login-button').click()
  await expect(page.getByTestId('login-modal')).toBeVisible()
})

test('closes modal on Escape', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dm-login-button').click()
  await expect(page.getByTestId('login-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('login-modal')).not.toBeVisible()
})

test('shows error on wrong credentials', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dm-login-button').click()
  await page.getByTestId('username-input').fill('admin')
  await page.getByTestId('password-input').fill('wrong-password')
  await page.getByTestId('login-submit').click()
  await expect(page.getByText(/Invalid credentials/i).first()).toBeVisible()
})

test('successful login redirects to /admin', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dm-login-button').click()
  await page.getByTestId('username-input').fill(process.env.ADMIN_DEFAULT_USERNAME || 'admin')
  await page.getByTestId('password-input').fill(process.env.ADMIN_DEFAULT_PASSWORD || 'admin')
  await page.getByTestId('login-submit').click()
  await page.waitForURL('/admin', { timeout: 5_000 })
  await expect(page).toHaveURL('/admin')
})

test('/admin redirects to / when not authenticated', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForURL('/', { timeout: 5_000 })
  await expect(page).toHaveURL('/')
})

test('JWT token survives page reload', async ({ page }) => {
  const token = await getAdminToken()
  await loginAsAdmin(page, token)
  await page.reload()
  await expect(page).toHaveURL('/admin')
})
