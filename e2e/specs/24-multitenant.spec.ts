import { test, expect } from '../fixtures'
import { loginAs } from '../helpers/auth'
import { createSession, createSessionFull, listSessions } from '../helpers/session'
import { createTestAdmin } from '../fixtures/db'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

// Minimal 1×1 GIF — accepted by all image filters (gif is in AVATAR_ALLOWED_MIMES)
const TINY_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICRAEAOw==',
  'base64'
)

function makeImageBlob(): Blob {
  return new Blob([TINY_GIF], { type: 'image/gif' })
}

async function uploadSessionImage(token: string, sessionId: number): Promise<string> {
  const formData = new FormData()
  formData.append('file', makeImageBlob(), 'map.gif')
  formData.append('session_id', String(sessionId))
  const res = await fetch(`${BACKEND_URL}/api/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) throw new Error(`uploadSessionImage failed: ${res.status}`)
  const data = await res.json() as { url: string }
  return data.url
}

async function uploadAvatar(sessionCode?: string): Promise<string> {
  const formData = new FormData()
  if (sessionCode) formData.append('sessionCode', sessionCode)
  formData.append('file', makeImageBlob(), 'avatar.gif')
  const res = await fetch(`${BACKEND_URL}/api/uploads/avatar`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error(`uploadAvatar failed: ${res.status}`)
  const data = await res.json() as { url: string }
  return data.url
}

// URL pattern: /uploads/<tenantId>/<filename>
const TENANT_URL_RE = /^\/uploads\/(\d+)\/[^/]+$/

// ── Isolation DB ──────────────────────────────────────────────────────────────

test('chaque admin ne voit que ses propres sessions', async ({ adminToken }, testInfo) => {
  const token1 = adminToken
  const admin2name = `admin2_w${testInfo.workerIndex}`
  await createTestAdmin(admin2name, 'admin2')
  const token2 = await loginAs(admin2name, 'admin2')

  await createSession(token1, 'Session Admin1')
  await createSession(token2, 'Session Admin2')

  const sessions1 = await listSessions(token1)
  const sessions2 = await listSessions(token2)

  expect(sessions1.every((s) => s.name === 'Session Admin1')).toBe(true)
  expect(sessions1.some((s) => s.name === 'Session Admin2')).toBe(false)
  expect(sessions2.every((s) => s.name === 'Session Admin2')).toBe(true)
  expect(sessions2.some((s) => s.name === 'Session Admin1')).toBe(false)
})

test("un admin ne peut pas supprimer la session d'un autre admin", async ({ adminToken }, testInfo) => {
  const token1 = adminToken
  const admin2name = `admin2_w${testInfo.workerIndex}`
  await createTestAdmin(admin2name, 'admin2')
  const token2 = await loginAs(admin2name, 'admin2')

  const session = await createSessionFull(token1, 'Cible')

  const res = await fetch(`${BACKEND_URL}/api/sessions/${session.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token2}` },
  })
  expect(res.status).toBe(404)

  // La session d'admin1 est toujours présente
  const remaining = await listSessions(token1)
  expect(remaining.some((s) => s.id === session.id)).toBe(true)
})

// ── Isolation fichiers ────────────────────────────────────────────────────────

test("l'upload d'image crée un sous-dossier par tenant", async ({ adminToken }, testInfo) => {
  const token1 = adminToken
  const admin2name = `admin2_w${testInfo.workerIndex}`
  const { id: admin2Id } = await createTestAdmin(admin2name, 'admin2')
  const token2 = await loginAs(admin2name, 'admin2')

  const session1 = await createSessionFull(token1, 'S1')
  const session2 = await createSessionFull(token2, 'S2')

  const url1 = await uploadSessionImage(token1, session1.id)
  const url2 = await uploadSessionImage(token2, session2.id)

  // Les deux URLs suivent le schéma /uploads/<tenantId>/<filename>
  expect(url1).toMatch(TENANT_URL_RE)
  expect(url2).toMatch(TENANT_URL_RE)

  // Les sous-dossiers tenant sont différents
  const tenantId1 = url1.match(TENANT_URL_RE)![1]
  const tenantId2 = url2.match(TENANT_URL_RE)![1]
  expect(tenantId1).not.toBe(tenantId2)

  // admin2Id correspond bien au tenant d'admin2
  expect(tenantId2).toBe(String(admin2Id))
})

test("les fichiers uploadés sont accessibles via leur URL", async ({ adminToken }) => {
  const token = adminToken
  const session = await createSessionFull(token, 'AccessTest')
  const url = await uploadSessionImage(token, session.id)

  const res = await fetch(`${BACKEND_URL}${url}`)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('image/')
})

test("l'upload avatar utilise le dossier tenant de la session", async ({ adminToken }, testInfo) => {
  const token1 = adminToken
  const admin2name = `admin2_w${testInfo.workerIndex}`
  const { id: admin2Id } = await createTestAdmin(admin2name, 'admin2')
  const token2 = await loginAs(admin2name, 'admin2')

  const session1 = await createSessionFull(token1, 'AvatarS1')
  const session2 = await createSessionFull(token2, 'AvatarS2')

  const avatarUrl1 = await uploadAvatar(session1.code)
  const avatarUrl2 = await uploadAvatar(session2.code)

  expect(avatarUrl1).toMatch(TENANT_URL_RE)
  expect(avatarUrl2).toMatch(TENANT_URL_RE)

  const tenantId1 = avatarUrl1.match(TENANT_URL_RE)![1]
  const tenantId2 = avatarUrl2.match(TENANT_URL_RE)![1]
  expect(tenantId1).not.toBe(tenantId2)
  expect(tenantId2).toBe(String(admin2Id))
})

test("l'upload avatar sans sessionCode va dans le dossier public", async ({}) => {
  const url = await uploadAvatar()
  expect(url).toMatch(/^\/uploads\/public\/[^/]+$/)
})

test('supprimer une session efface les fichiers du tenant', async ({ adminToken }) => {
  const token = adminToken
  const session = await createSessionFull(token, 'DeleteTest')
  const imageUrl = await uploadSessionImage(token, session.id)

  // Fichier accessible avant suppression
  const beforeRes = await fetch(`${BACKEND_URL}${imageUrl}`)
  expect(beforeRes.status).toBe(200)

  // Suppression de la session
  const delRes = await fetch(`${BACKEND_URL}/api/sessions/${session.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(delRes.ok).toBe(true)

  // Fichier inaccessible après suppression
  const afterRes = await fetch(`${BACKEND_URL}${imageUrl}`)
  expect(afterRes.status).toBe(404)
})
