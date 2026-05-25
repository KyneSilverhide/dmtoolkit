import { test, expect } from '../fixtures'
import { createSession, createSessionFull } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import * as path from 'path'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const AUDIO_FIXTURE = path.join(process.cwd(), 'fixtures', '_test_audio.wav')

// ── API-level tests (no browser) ──────────────────────────────────────────

test('POST /api/uploads/audio returns 401 without token', async () => {
  const res = await fetch(`${BACKEND_URL}/api/uploads/audio`, { method: 'POST' })
  expect(res.status).toBe(401)
})

test('GET /api/sessions/:id/images returns 401 without token', async ({ adminToken }) => {
  const { id } = await createSessionFull(adminToken)
  const res = await fetch(`${BACKEND_URL}/api/sessions/${id}/images?type=audio`)
  expect(res.status).toBe(401)
})

test('API: upload audio → list → rename → change category → delete', async ({ adminToken }) => {
  const { id: sessionId } = await createSessionFull(adminToken)

  // Upload a minimal WAV via FormData
  const wavBytes = new Uint8Array(844)
  const view = new DataView(wavBytes.buffer)
  const enc = new TextEncoder()
  enc.encode('RIFF').forEach((b, i) => view.setUint8(i, b))
  view.setUint32(4, 36 + 800, true)
  enc.encode('WAVE').forEach((b, i) => view.setUint8(8 + i, b))
  enc.encode('fmt ').forEach((b, i) => view.setUint8(12 + i, b))
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  enc.encode('data').forEach((b, i) => view.setUint8(36 + i, b))
  view.setUint32(40, 800, true)
  wavBytes.fill(128, 44)

  const formData = new FormData()
  formData.append('session_id', String(sessionId))
  formData.append('files', new Blob([wavBytes], { type: 'audio/wav' }), 'api_test.wav')

  const uploadRes = await fetch(`${BACKEND_URL}/api/uploads/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: formData,
  })
  expect(uploadRes.status).toBe(200)
  const uploadData = await uploadRes.json() as { urls: string[] }
  expect(uploadData.urls).toHaveLength(1)

  // List
  const listRes = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/images?type=audio`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(listRes.status).toBe(200)
  const tracks = await listRes.json() as Array<{ id: number; original_name: string; audio_category: string }>
  expect(tracks).toHaveLength(1)
  const trackId = tracks[0].id

  // Rename
  const renameRes = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/images/${trackId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ original_name: 'Ma Piste Renommée' }),
  })
  expect(renameRes.status).toBe(200)
  const renamed = await renameRes.json() as { original_name: string }
  expect(renamed.original_name).toBe('Ma Piste Renommée')

  // Change category
  const catRes = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/images/${trackId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_category: 'Combat' }),
  })
  expect(catRes.status).toBe(200)
  const catData = await catRes.json() as { audio_category: string }
  expect(catData.audio_category).toBe('Combat')

  // Delete
  const deleteRes = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/images/${trackId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(deleteRes.status).toBe(200)

  // Verify gone
  const listRes2 = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/images?type=audio`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const tracksAfter = await listRes2.json() as unknown[]
  expect(tracksAfter).toHaveLength(0)
})

// ── UI-level tests (browser) ──────────────────────────────────────────────

test('audio tab shows empty state when no tracks', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('audio')

    await expect(adminPage.page.locator('.empty-state')).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.locator('.empty-state')).toContainText(/aucun fichier audio/i)
  } finally {
    await adminCtx.close()
  }
})

async function uploadAudioFile(adminPage: AdminPage): Promise<void> {
  const fileChooserPromise = adminPage.page.waitForEvent('filechooser')
  await adminPage.page.locator('label.upload-btn').click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(AUDIO_FIXTURE)
  await expect(adminPage.page.locator('.track-tile')).toHaveCount(1, { timeout: 15_000 })
}

test('audio tab: upload a file, track tile appears', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('audio')

    await uploadAudioFile(adminPage)

    await expect(adminPage.page.locator('.track-tile .track-name').first())
      .toContainText('_test_audio', { timeout: 8_000 })
    // Empty state must be gone
    await expect(adminPage.page.locator('.empty-state')).not.toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('audio tab: rename track via double-click', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('audio')
    await uploadAudioFile(adminPage)

    // Double-click opens the inline rename input
    await adminPage.page.locator('.track-tile .track-name').first().dblclick()
    const renameInput = adminPage.page.locator('.rename-input').first()
    await expect(renameInput).toBeVisible({ timeout: 5_000 })
    await renameInput.fill('Chanson du Dragon')
    await renameInput.press('Enter')

    await expect(adminPage.page.locator('.track-tile .track-name').first())
      .toContainText('Chanson du Dragon', { timeout: 5_000 })
  } finally {
    await adminCtx.close()
  }
})

test('audio tab: delete single track, empty state returns', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('audio')
    await uploadAudioFile(adminPage)

    // Register dialog handler before click
    adminPage.page.once('dialog', (d) => d.accept())
    await adminPage.page.locator('.track-tile .icon-btn.danger').first().click()

    await expect(adminPage.page.locator('.track-tile')).toHaveCount(0, { timeout: 8_000 })
    await expect(adminPage.page.locator('.empty-state')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('audio tab: reclassify shows error when AI unavailable (503)', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('audio')
    await uploadAudioFile(adminPage)

    await adminPage.page.route('**/api/uploads/audio/reclassify', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GITHUB_TOKEN non configuré — IA indisponible.' }),
      })
    )

    await adminPage.page.locator('button.reclassify-btn').click()

    const errorMsg = adminPage.page.locator('p.reclassify-error')
    await expect(errorMsg).toBeVisible({ timeout: 8_000 })
    await expect(errorMsg).toContainText(/GITHUB_TOKEN|IA indisponible/i)
  } finally {
    await adminCtx.close()
  }
})

test('audio tab: reclassify updates track category on success', async ({ browser, adminToken }) => {
  test.setTimeout(30_000)
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('audio')
    await uploadAudioFile(adminPage)

    await adminPage.page.route('**/api/uploads/audio/reclassify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated: 1,
          categories: { '_test_audio.wav': 'Combat' },
        }),
      })
    )

    await adminPage.page.locator('button.reclassify-btn').click()

    const catInput = adminPage.page.locator('.track-tile .cat-input').first()
    await expect(catInput).toHaveValue('Combat', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})
