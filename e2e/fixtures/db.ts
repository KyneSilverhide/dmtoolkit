import { Client } from 'pg'
import bcrypt from 'bcrypt'

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://criticalfail:criticalfail@localhost:5432/criticalfail_test'

async function ensureDbExists(): Promise<void> {
  const url = new URL(DATABASE_URL)
  const dbName = url.pathname.slice(1)
  url.pathname = '/postgres'
  const admin = new Client({ connectionString: url.toString() })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`)
  } catch (err: any) {
    if (err.code !== '42P04') throw err // 42P04 = duplicate_database, ignore
  } finally {
    await admin.end()
  }
}

export async function resetDb(): Promise<void> {
  await ensureDbExists()
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    // Truncate in FK-safe order; keep admins table intact to avoid bcrypt rehash each test
    await client.query(`
      TRUNCATE
        vote_responses, votes, purchase_requests,
        merchant_items, merchants,
        dice_results, messages, session_events, session_images,
        players, sessions
      RESTART IDENTITY CASCADE
    `)
    // Ensure the admin account exists (idempotent upsert)
    const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin'
    const existing = await client.query('SELECT id FROM admins WHERE username = $1', [username])
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(password, 10)
      await client.query('INSERT INTO admins (username, password) VALUES ($1, $2)', [username, hash])
    }
  } finally {
    await client.end()
  }
}
