import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'

const PLAYER_MEMORY_KEY = 'cf_player_last_known_by_session'


test('player view persists after page reload', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Bilbo', hp: 30 })
  await expect(page).toHaveURL(/\/view\//)

  await page.reload()

  // After reload, auto-rejoin kicks in — tab bar should appear
  await expect(page.getByTestId('player-tab-combat').filter({ visible: true })).toBeVisible({ timeout: 8_000 })
})

test('player name is preserved after auto-rejoin', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Gollum', hp: 25 })

  await page.reload()
  await expect(page.getByText('Gollum')).toBeVisible({ timeout: 8_000 })
})

test('navigating directly to /view/:code auto-rejoins from localStorage', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  // Seed localStorage manually with a known player
  await page.goto('/')
  await page.evaluate(
    ({ key, code: sessionCode }) => {
      const stored: Record<string, unknown> = {}
      stored[sessionCode] = {
        name: 'Tom Bombadil',
        ac: 12,
        hp: 40,
        maxHp: 40,
        dndClass: 'Barbare',
        avatarUrl: null,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(key, JSON.stringify(stored))
    },
    { key: PLAYER_MEMORY_KEY, code: code.toLowerCase() }
  )

  await page.goto(`/view/${code}`)
  await expect(page.getByTestId('player-tab-combat').filter({ visible: true })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('Tom Bombadil')).toBeVisible()
})

test('auto-rejoin error shown when no localStorage entry exists', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  // Navigate directly without any localStorage entry
  await page.goto(`/view/${code}`)

  // Should show an error or redirect to join page
  await Promise.race([
    expect(page.getByText(/session non récupérable/i)).toBeVisible({ timeout: 8_000 }),
    expect(page).toHaveURL(/\/join\//, { timeout: 8_000 }),
  ])
})
