import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { getAdminToken, clearTokenCache, loginAsAdmin } from '../helpers/auth'
import { createSession, listSessions } from '../helpers/session'

test.beforeEach(async () => {
  clearTokenCache()
  await resetDb()
})

test('creates a session via API', async () => {
  const token = await getAdminToken()
  const code = await createSession(token, 'Session Alpha')
  expect(code).toMatch(/^\d{4}$/)
})

test('lists created sessions via API', async () => {
  const token = await getAdminToken()
  await createSession(token, 'Session Beta')
  const sessions = await listSessions(token)
  expect(sessions.some((s) => s.name === 'Session Beta')).toBe(true)
})

test('session appears in admin UI after creation', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token, 'Session Gamma')
  await loginAsAdmin(page, token)
  await expect(page.getByText(code)).toBeVisible()
})

test('can select a session in the admin UI', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token, 'Session Delta')
  await loginAsAdmin(page, token)
  await page.getByText(code).first().click()
  // After selecting a session, the players tab should be visible
  await expect(page.getByTestId('tab-players')).toBeVisible()
})

test('can delete a session via API', async () => {
  const token = await getAdminToken()
  await createSession(token, 'Session Epsilon')
  const before = await listSessions(token)
  const session = before.find((s) => s.name === 'Session Epsilon')!
  const res = await fetch(
    `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/sessions/${session.id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  )
  expect(res.ok).toBe(true)
  const after = await listSessions(token)
  expect(after.some((s) => s.name === 'Session Epsilon')).toBe(false)
})

test('session code is 4 digits', async () => {
  const token = await getAdminToken()
  const code = await createSession(token)
  expect(code.length).toBe(4)
  expect(Number(code)).toBeGreaterThanOrEqual(0)
})

test('two sessions have different codes', async () => {
  const token = await getAdminToken()
  const code1 = await createSession(token, 'Session One')
  const code2 = await createSession(token, 'Session Two')
  expect(code1).not.toBe(code2)
})
