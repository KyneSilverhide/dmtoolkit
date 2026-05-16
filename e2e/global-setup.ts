import { getAdminToken } from './helpers/auth'
import { resetDb } from './fixtures/db'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

async function waitForBackend(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/health`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 2_000))
  }
  throw new Error(
    `Backend at ${BACKEND_URL} not reachable after ${timeoutMs / 1000}s.\n` +
    `Start it first: docker compose -f docker-compose.yml -f e2e/docker-compose.test.yml up -d postgres backend`
  )
}

export default async function globalSetup() {
  // Wait for backend to be ready — it runs DB migrations on startup.
  await waitForBackend()
  // Reset DB to a clean slate (DB is created automatically if missing).
  await resetDb()
  // Verify admin credentials are valid.
  await getAdminToken()
}
