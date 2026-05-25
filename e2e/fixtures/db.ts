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


export async function resetDbForWorker(workerIndex: number, mainAdminId: number): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    // Find all admin IDs for this worker: main admin + any secondary test admins created during tests
    const adminsRes = await client.query(
      `SELECT id FROM admins WHERE username ~ $1`,
      [`_w${workerIndex}$`]
    )
    const adminIds: number[] = adminsRes.rows.map((r: { id: number }) => r.id)
    if (adminIds.length === 0) return

    // DELETE in FK-safe order for all admins of this worker
    await client.query(
      `DELETE FROM vote_responses WHERE vote_id IN (
        SELECT v.id FROM votes v
        JOIN sessions s ON s.id = v.session_id
        WHERE s.created_by = ANY($1::int[])
      )`,
      [adminIds]
    )
    // Break FK cycles before deleting child rows
    await client.query(
      `UPDATE sessions SET current_vote_id = NULL WHERE created_by = ANY($1::int[])`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM votes WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM purchase_requests WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `UPDATE sessions SET current_merchant_id = NULL WHERE created_by = ANY($1::int[])`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM merchant_items WHERE merchant_id IN (
        SELECT m.id FROM merchants m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.created_by = ANY($1::int[])
      )`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM merchants WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM dice_results WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM session_events WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM session_images WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(
      `DELETE FROM players WHERE session_id IN (SELECT id FROM sessions WHERE created_by = ANY($1::int[]))`,
      [adminIds]
    )
    await client.query(`DELETE FROM sessions WHERE created_by = ANY($1::int[])`, [adminIds])

    // Remove secondary test admins (all worker admins except the main one)
    await client.query(
      `DELETE FROM admins WHERE username ~ $1 AND id != $2`,
      [`_w${workerIndex}$`, mainAdminId]
    )
  } finally {
    await client.end()
  }
}

export async function createTestAdmin(username: string, password: string): Promise<{ id: number }> {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await client.query(
      `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [username, hash]
    )
    return { id: result.rows[0].id }
  } finally {
    await client.end()
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
    // Remove test admins created during multi-tenant tests
    const defaultUsername = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
    await client.query('DELETE FROM admins WHERE username != $1', [defaultUsername])

    // Ensure the admin account exists (idempotent upsert)
    const username = defaultUsername
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin'
    const existing = await client.query('SELECT id FROM admins WHERE username = $1', [username])
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(password, 10)
      await client.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash])
    }
  } finally {
    await client.end()
  }
}
