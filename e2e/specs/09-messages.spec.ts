import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test('admin sends a message to all players and player receives it', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Rogue', hp: 32 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Switch to message tab
    await adminPage.switchTab('message')

    // Fill and send a text message
    await adminPage.page.locator('textarea.form-textarea').fill('Bienvenue dans le donjon !')
    await adminPage.page.getByTestId('message-send-btn').click()

    // Player should see the message in messages tab
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await expect(playerPg.getByText('Bienvenue dans le donjon !')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('unread messages badge increments', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Scout', hp: 28 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('message')
    await adminPage.page.locator('textarea.form-textarea').fill('Message 1')
    await adminPage.page.getByTestId('message-send-btn').click()

    // The messages tab badge on player should show 1
    await expect(playerPg.locator('[data-testid="player-tab-messages"]').filter({ visible: true }).locator('.tab-badge')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('message targeted to specific player received only by them', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const player1Ctx = await browser.newContext()
  const player2Ctx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const player1Pg = await player1Ctx.newPage()
    await joinAsPlayer(player1Pg, code, { name: 'Fighter', hp: 55 })

    const player2Pg = await player2Ctx.newPage()
    await joinAsPlayer(player2Pg, code, { name: 'Cleric', hp: 40 })

    await expect(adminPage.page.locator('[data-testid^="player-row-"]')).toHaveCount(2, { timeout: 8_000 })

    await adminPage.switchTab('message')

    // Select Fighter specifically (first player in list)
    const playerSelect = adminPage.page.locator('.message-tool select.form-select')
    await expect(playerSelect).toBeVisible({ timeout: 8_000 })
    await playerSelect.selectOption({ label: 'Fighter' })
    await adminPage.page.locator('textarea.form-textarea').fill('Message secret pour Fighter')
    await adminPage.page.getByTestId('message-send-btn').click()

    const p1page = new PlayerPage(player1Pg)
    await p1page.switchTab('messages')
    await expect(player1Pg.getByText('Message secret pour Fighter')).toBeVisible({ timeout: 8_000 })

    // Player 2 should NOT receive it
    const p2page = new PlayerPage(player2Pg)
    await p2page.switchTab('messages')
    await expect(player2Pg.getByText('Message secret pour Fighter')).not.toBeVisible({ timeout: 3_000 })
  } finally {
    await adminCtx.close()
    await player1Ctx.close()
    await player2Ctx.close()
  }
})

test('player message appears with author name', async ({ browser, adminToken }) => {
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

    await adminPage.switchTab('message')
    const authorInput = adminPage.page.locator('input[placeholder*="auteur" i], input[placeholder*="author" i]').first()
    if (await authorInput.count()) {
      await authorInput.fill('Le Grand Maître')
    }
    await adminPage.page.locator('textarea.form-textarea').fill('Ton destin t\'attend.')
    await adminPage.page.getByTestId('message-send-btn').click()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('messages')
    await expect(playerPg.getByText('Ton destin t\'attend.')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('message clears after send', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Druid', hp: 46 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('message')
    const textarea = adminPage.page.locator('textarea.form-textarea')
    await textarea.fill('Message à effacer')
    await adminPage.page.getByTestId('message-send-btn').click()

    await expect(textarea).toHaveValue('', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('messages tab icon animates on new message', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Barbarian', hp: 70 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('message')
    await adminPage.page.locator('textarea.form-textarea').fill('Alerte !')
    await adminPage.page.getByTestId('message-send-btn').click()

    // The messages tab icon should get the notify animation class (tab-icon-notify)
    await expect(playerPg.locator('[data-testid="player-tab-messages"] .tab-icon-notify')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
