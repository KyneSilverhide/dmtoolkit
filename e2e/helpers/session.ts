const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

export async function createSession(token: string, name = 'Test Session'): Promise<string> {
  const s = await createSessionFull(token, name)
  return s.code
}

export async function createSessionFull(token: string, name = 'Test Session'): Promise<{ id: number; code: string }> {
  const res = await fetch(`${BACKEND_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as { session: { id: number; code: string } }
  return data.session
}

export async function deleteSession(token: string, sessionId: number): Promise<void> {
  await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function listSessions(token: string): Promise<Array<{ id: number; code: string; name: string }>> {
  const res = await fetch(`${BACKEND_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`listSessions failed: ${res.status}`)
  return (await res.json()) as Array<{ id: number; code: string; name: string }>
}
