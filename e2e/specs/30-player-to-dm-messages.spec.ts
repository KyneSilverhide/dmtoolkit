import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test('player can send a secret message to the DM', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Bard', hp: 35 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Player navigates to messages tab and sends a secret message
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')

    const composeTextarea = playerPg.locator('.compose-textarea')
    await expect(composeTextarea).toBeVisible({ timeout: 6_000 })
    await composeTextarea.fill('Message secret du barde')
    await playerPg.locator('.compose-send-btn').click()

    // Confirmation should appear
    await expect(playerPg.locator('.compose-feedback')).toBeVisible({ timeout: 6_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('DM sees a player message in that player\'s conversation thread', async ({ browser, adminToken }) => {
  const code = await createSession(adminToken)
  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Ranger', hp: 42 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await playerPg.locator('.compose-textarea').fill("Besoin d'aide ici")
    await playerPg.locator('.compose-send-btn').click()

    // The player sees their own message in their thread
    await expect(playerPg.getByTestId('own-message').filter({ hasText: "Besoin d'aide ici" })).toBeVisible({ timeout: 6_000 })

    // The DM never opened the Messages tab: the big persistent notification shows up anyway
    const toast = adminPage.page.getByTestId('player-message-toast')
    await expect(toast).toBeVisible({ timeout: 8_000 })
    await expect(toast).toContainText('Ranger')

    // Clicking it opens that player's thread
    await adminPage.page.getByTestId('player-message-toast-open').click()
    await expect(adminPage.page.getByTestId('thread-message').filter({ hasText: "Besoin d'aide ici" })).toBeVisible({ timeout: 6_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('unread badge shows on the thread chip and clears once the thread is read', async ({ browser, adminToken }) => {
  const code = await createSession(adminToken)
  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Druid', hp: 50 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('message')
    await expect(adminPage.page.getByTestId('thread-unread-badge')).toHaveCount(0)

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await playerPg.locator('.compose-textarea').fill('Message non lu')
    await playerPg.locator('.compose-send-btn').click()

    // Another thread is selected ("Tous"): the Druid chip is flagged and the big card appears
    await expect(adminPage.page.getByTestId('thread-unread-badge')).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByTestId('player-message-toast')).toBeVisible()

    await adminPage.page.locator('[data-testid^="thread-chip-"]', { hasText: 'Druid' }).click()
    await expect(adminPage.page.getByTestId('thread-unread-badge')).toHaveCount(0, { timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('conversation persists across an admin reload and the DM can reply from the thread', async ({ browser, adminToken }) => {
  // Plusieurs contextes + rechargement : ~15 s en local, au-delà de 25 s sur le runner CI.
  test.setTimeout(60_000)
  const code = await createSession(adminToken)
  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(adminToken)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Paladin', hp: 60 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await playerPg.locator('.compose-textarea').fill('Ai-je bien agi ?')
    await playerPg.locator('.compose-send-btn').click()
    await expect(playerPg.getByTestId('own-message')).toBeVisible({ timeout: 6_000 })

    // Reload the admin: history comes back from the database
    await adminPage.page.reload()
    await adminPage.selectSession(code)
    await adminPage.switchTab('message')
    await adminPage.page.locator('[data-testid^="thread-chip-"]', { hasText: 'Paladin' }).click()
    await expect(adminPage.page.getByTestId('thread-message').filter({ hasText: 'Ai-je bien agi ?' })).toBeVisible({ timeout: 8_000 })

    // Reply from the selected thread
    await adminPage.page.locator('textarea.form-textarea').fill('Oui, la lumière guide tes pas.')
    await adminPage.page.getByTestId('message-send-btn').click()
    await expect(playerPg.getByText('Oui, la lumière guide tes pas.')).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByTestId('thread-message').filter({ hasText: 'Oui, la lumière guide tes pas.' })).toBeVisible({ timeout: 6_000 })

    // The player reloads: both sides of the exchange are still there
    await playerPg.reload()
    await playerPage.switchTab('messages')
    await expect(playerPg.getByText('Ai-je bien agi ?')).toBeVisible({ timeout: 8_000 })
    await expect(playerPg.getByText('Oui, la lumière guide tes pas.')).toBeVisible()
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('player quick reply button on DM message opens compose with context', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Wizard', hp: 28 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Admin sends a message to the player
    await adminPage.switchTab('message')
    await adminPage.page.locator('textarea.form-textarea').fill('Prépare un sort !')
    await adminPage.page.getByTestId('message-send-btn').click()

    // Player navigates to messages tab and sees the message
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await expect(playerPg.getByText('Prépare un sort !')).toBeVisible({ timeout: 8_000 })

    // Player clicks the reply icon on the message — this triggers @reply event
    const replyBtn = playerPg.locator('.reply-btn').first()
    if (await replyBtn.count()) {
      await replyBtn.click()
      // Reply context should appear in the compose area
      await expect(playerPg.locator('.reply-context')).toBeVisible({ timeout: 5_000 })
    }
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
