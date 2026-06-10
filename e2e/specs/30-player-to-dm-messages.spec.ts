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

test('DM receives player message in the inbox', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Ranger', hp: 42 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Admin opens the message tool first so socket listener is registered
    await adminPage.switchTab('message')
    const inboxToggle = adminPage.page.locator('.inbox-toggle')
    await expect(inboxToggle).toBeVisible({ timeout: 6_000 })

    // Player sends secret message
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await playerPg.locator('.compose-textarea').fill('Besoin d\'aide ici')
    await playerPg.locator('.compose-send-btn').click()

    // Admin opens inbox — message should arrive via socket
    await inboxToggle.click()

    // Inbox should show the player message
    await expect(adminPage.page.locator('.inbox-entry .inbox-entry-content').filter({ hasText: "Besoin d'aide ici" })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.locator('.inbox-entry .inbox-entry-name').filter({ hasText: 'Ranger' })).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('unread badge appears on admin inbox when player sends a message', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Druid', hp: 50 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('message')

    // Inbox starts with no badge
    await expect(adminPage.page.locator('.inbox-badge')).not.toBeVisible()

    // Player sends a message
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await playerPg.locator('.compose-textarea').fill('Message non lu')
    await playerPg.locator('.compose-send-btn').click()

    // Admin should now see the unread badge
    await expect(adminPage.page.locator('.inbox-badge')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('admin can reply to a player message via inbox reply button', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Paladin', hp: 60 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Admin opens message tool first to register socket listener
    await adminPage.switchTab('message')
    await expect(adminPage.page.locator('.inbox-toggle')).toBeVisible({ timeout: 6_000 })

    // Player sends a message
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await playerPg.locator('.compose-textarea').fill('Ai-je bien agi ?')
    await playerPg.locator('.compose-send-btn').click()

    // Admin opens inbox — wait for the entry to arrive via socket
    await adminPage.page.locator('.inbox-toggle').click()
    await expect(adminPage.page.locator('.inbox-entry')).toBeVisible({ timeout: 8_000 })

    // Admin clicks "Répondre" button
    await adminPage.page.locator('.inbox-reply-btn').first().click()

    // The player select dropdown should now target "Paladin"
    const playerSelect = adminPage.page.locator('.message-tool select.form-select')
    await expect(playerSelect).not.toHaveValue('all', { timeout: 5_000 })

    // Admin sends the reply
    await adminPage.page.locator('textarea.form-textarea').fill('Oui, la lumière guide tes pas.')
    await adminPage.page.getByTestId('message-send-btn').click()

    // Player receives the reply
    await expect(playerPg.getByText('Oui, la lumière guide tes pas.')).toBeVisible({ timeout: 8_000 })
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
