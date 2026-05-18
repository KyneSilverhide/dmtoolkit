import { test, expect } from '../fixtures'
import { getAdminToken } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

// ── API-level tests (no UI) ────────────────────────────────────────────────

test('POST /api/generate returns 401 without token', async () => {
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'npc_name' }),
  })
  expect(res.status).toBe(401)
})

test('POST /api/generate returns 400 for invalid type', async () => {
  const token = await getAdminToken()
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'invalid_type' }),
  })
  expect(res.status).toBe(400)
  const data = await res.json() as { error: string }
  expect(data.error).toMatch(/invalide/i)
})

test('generator shows server error message on 503 response', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('generator')

    await adminPage.page.route('**/api/generate', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GITHUB_TOKEN non configuré sur le serveur.' }),
      }),
    )

    await adminPage.page.locator('button.generate-btn').click()

    const errorMsg = adminPage.page.locator('p.form-error')
    await expect(errorMsg).toBeVisible({ timeout: 5_000 })
    await expect(errorMsg).toContainText(/GITHUB_TOKEN|serveur/i)
  } finally {
    await adminCtx.close()
  }
})

// ── UI tests (page.route() mocks) ─────────────────────────────────────────

test('generator tab is accessible and generate button enabled after session select', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('generator')

    const btn = adminPage.page.locator('button.generate-btn')
    await expect(btn).toBeVisible({ timeout: 5_000 })
    await expect(btn).toBeEnabled()
  } finally {
    await adminCtx.close()
  }
})

test('generator returns list of names for npc_name (multi-result)', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('generator')

    await adminPage.page.route('**/api/generate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: 'Aldric\nBertran\nCélestine\nDuvain\nElowen',
          quota: { remaining: 100, limit: 150, resetAt: null },
        }),
      }),
    )

    await adminPage.page.locator('button.generate-btn').click()

    const items = adminPage.page.locator('ul.results-list li.result-item')
    await expect(items).toHaveCount(5, { timeout: 5_000 })
    await expect(items.first()).toContainText('Aldric')

    await expect(adminPage.page.locator('div.quota-bar')).toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('generator returns text block for quest_hook (single result)', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('generator')

    const typeSelect = adminPage.page.locator('.generator-tool select.form-select').first()
    await expect(typeSelect).toBeVisible({ timeout: 5_000 })
    await typeSelect.selectOption('quest_hook')

    await adminPage.page.route('**/api/generate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: 'Un marchand a disparu. Sa charrette gît abandonnée sur la route.',
          quota: { remaining: 99, limit: 150, resetAt: null },
        }),
      }),
    )

    await adminPage.page.locator('button.generate-btn').click()

    const block = adminPage.page.locator('div.result-block p.result-text-long')
    await expect(block).toBeVisible({ timeout: 5_000 })
    await expect(block).toContainText('marchand a disparu')

    await expect(adminPage.page.locator('ul.results-list')).not.toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('generator shows quota error on 429 response', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('generator')

    await adminPage.page.route('**/api/generate', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Quota GitHub Models épuisé.',
          quota: { remaining: 0, limit: 150, resetAt: '1h' },
        }),
      }),
    )

    await adminPage.page.locator('button.generate-btn').click()

    const errorMsg = adminPage.page.locator('p.form-error')
    await expect(errorMsg).toBeVisible({ timeout: 5_000 })
    await expect(errorMsg).toContainText(/quota.*épuisé|réinitialisation/i)
  } finally {
    await adminCtx.close()
  }
})
