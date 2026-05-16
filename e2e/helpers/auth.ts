import { Page } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const ADMIN_USERNAME = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'admin'

let cachedToken: string | null = null

export async function getAdminToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Admin login failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as { token: string }
  cachedToken = data.token
  return cachedToken
}

export function clearTokenCache() {
  cachedToken = null
}

export async function loginAsAdmin(page: Page, token: string) {
  await page.goto('/')
  await page.evaluate((t) => {
    localStorage.setItem('auth', JSON.stringify({ token: t, admin: true }))
  }, token)
  await page.goto('/admin')
}
