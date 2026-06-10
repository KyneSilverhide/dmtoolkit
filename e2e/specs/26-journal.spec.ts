import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

/**
 * Journal de session — tests e2e
 *
 * Vérifie que les événements importants de la session (rejoindre, dégâts,
 * vote, doom clock, round de combat) sont bien journalisés et apparaissent
 * dans l'onglet Journal de l'admin, à la fois en temps réel (socket) et
 * via l'endpoint de résumé.
 */

test('player join appears in journal in real-time', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // Open journal tab before the player joins so the socket listener is active
    await adminPage.switchTab('journal')

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Gandalf', hp: 60 })

    // Journal should show the join event
    await expect(adminPage.page.locator('.tl-desc').filter({ hasText: /Gandalf/ })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.locator('.tl-desc').filter({ hasText: /rejoint/ })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('HP damage appears in journal in real-time', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Aragorn', hp: 80 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Open journal tab so socket listener is active
    await adminPage.switchTab('journal')
    // Wait for journal to be fully mounted before navigating away (Transition leave ~150ms)
    await expect(adminPage.page.locator('.journal')).toBeVisible({ timeout: 5_000 })

    // Player takes damage
    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(60)

    // Journal should show a damage event for Aragorn
    await expect(adminPage.page.locator('.tl-desc').filter({ hasText: /Aragorn/ })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.locator('.tl-desc').filter({ hasText: /dégâts|PV/ })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('vote_started event appears in journal when admin creates a vote', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // Open journal tab first so the socket listener catches the event
    await adminPage.switchTab('journal')
    const pg = adminPage.page
    // Wait for journal to be fully mounted (ensures the socket listener is registered
    // before navigating away — the Transition mode="out-in" leave-animation takes ~150ms
    // and onMounted only fires once that animation completes)
    await expect(pg.locator('.journal')).toBeVisible({ timeout: 5_000 })

    // Create a vote
    await adminPage.switchTab('vote')
    await pg.locator('input[placeholder*="question" i], input[placeholder*="Question" i]').fill('Forêt ou Montagne ?')
    const optionInputs = pg.locator('input[placeholder*="option" i], input[placeholder*="Option" i]')
    await optionInputs.nth(0).fill('Forêt')
    await optionInputs.nth(1).fill('Montagne')
    await pg.locator('button.action-btn').filter({ hasText: /Lancer le vote/i }).click()

    // Switch back to journal and verify
    await adminPage.switchTab('journal')
    await expect(pg.locator('.tl-desc').filter({ hasText: /vote.*lancé|lancé.*vote/i })).toBeVisible({ timeout: 8_000 })
    await expect(pg.locator('.tl-desc').filter({ hasText: /Forêt ou Montagne/i })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('doom_clock_started event appears in journal', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // Open journal tab first
    await adminPage.switchTab('journal')
    const pg = adminPage.page
    // Wait for journal to be fully mounted before leaving (see note in vote test)
    await expect(pg.locator('.journal')).toBeVisible({ timeout: 5_000 })

    // Start doom clock (TvControls tab)
    await adminPage.switchTab('tension')
    const titleEl = pg.locator('input[placeholder*="Titre du compte à rebours"]').first()
    if (await titleEl.count()) await titleEl.fill('Éruption Volcanique')
    const minInput = pg.locator('input[placeholder="Minutes"]').first()
    if (await minInput.count()) await minInput.fill('0')
    const secInput = pg.locator('input[placeholder="Secondes"]').first()
    if (await secInput.count()) await secInput.fill('30')
    // Doom clock launch button (first "Lancer" button in the tab)
    await pg.locator('button.action-btn').filter({ hasText: /^Lancer$/i }).first().click()

    // Switch to journal and verify doom_clock_started event
    await adminPage.switchTab('journal')
    await expect(pg.locator('.tl-desc').filter({ hasText: /doom.*clock|clock.*lancée/i })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('combat_round event appears in journal', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // Open journal tab so socket listener is active
    await adminPage.switchTab('journal')
    const pg = adminPage.page
    // Wait for journal to be fully mounted before leaving (see note in vote test)
    await expect(pg.locator('.journal')).toBeVisible({ timeout: 5_000 })

    // The combat round control is in the tension/TvControls tab
    await adminPage.switchTab('tension')
    await pg.locator('button.action-btn').filter({ hasText: '+1' }).first().click()

    // Switch back to journal and verify combat_round event
    await adminPage.switchTab('journal')
    await expect(pg.locator('.tl-desc').filter({ hasText: /round/i })).toBeVisible({ timeout: 8_000 })
    await expect(pg.locator('.tl-desc').filter({ hasText: /1/ })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('journal loads past events from API via summary button', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // Player joins (generates join event in DB)
    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Legolas', hp: 70 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Player takes damage (generates damage event in DB)
    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(50)

    // Admin creates a vote (generates vote_started event in DB)
    await adminPage.switchTab('vote')
    const pg = adminPage.page
    await pg.locator('input[placeholder*="question" i], input[placeholder*="Question" i]').fill('Avancer ou reculer ?')
    const optionInputs = pg.locator('input[placeholder*="option" i], input[placeholder*="Option" i]')
    await optionInputs.nth(0).fill('Avancer')
    await optionInputs.nth(1).fill('Reculer')
    await pg.locator('button.action-btn').filter({ hasText: /Lancer le vote/i }).click()

    // Now navigate to journal and click "Générer le résumé"
    await adminPage.switchTab('journal')
    await pg.locator('button.summary-btn').click()

    // Summary should appear
    await expect(pg.locator('.summary-text')).toBeVisible({ timeout: 10_000 })
    await expect(pg.locator('.summary-text')).toContainText('Résumé', { timeout: 10_000 })

    // Past events should be listed in the timeline
    await expect(pg.locator('.timeline-item')).not.toHaveCount(0, { timeout: 10_000 })

    // There should be a join event for Legolas
    await expect(pg.locator('.tl-desc').filter({ hasText: /Legolas.*rejoint/i })).toBeVisible({ timeout: 8_000 })

    // There should be a damage/PV event
    await expect(pg.locator('.tl-desc').filter({ hasText: /dégâts|PV/i })).toBeVisible({ timeout: 8_000 })

    // There should be a vote_started event
    await expect(pg.locator('.tl-desc').filter({ hasText: /vote.*lancé|lancé.*vote/i })).toBeVisible({ timeout: 8_000 })
    await expect(pg.locator('.tl-desc').filter({ hasText: /Avancer ou reculer/i })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('tension_started event appears in journal', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await adminPage.switchTab('journal')
    const pg = adminPage.page
    // Wait for journal to be fully mounted before leaving (see note in vote test)
    await expect(pg.locator('.journal')).toBeVisible({ timeout: 5_000 })

    // Create a tension scale (form is in the tension/TvControls tab)
    await adminPage.switchTab('tension')
    const titleInput = pg.locator('input[placeholder*="Titre de l\'échelle"]').first()
    await expect(titleInput).toBeVisible({ timeout: 5_000 })
    await titleInput.fill('Tension des négociations')
    const stepsInput = pg.locator('input[placeholder*="Étapes"]').first()
    await stepsInput.fill('5')
    await pg.locator('button[data-testid="tension-create-btn"]').click()

    // Switch to journal and verify tension_started event
    await adminPage.switchTab('journal')
    await expect(pg.locator('.tl-desc').filter({ hasText: /tension.*lancée|lancée.*tension/i })).toBeVisible({ timeout: 8_000 })
    await expect(pg.locator('.tl-desc').filter({ hasText: /Tension des négociations/i })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('journal displays session stats (duration, damage, healing) in real-time', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Fighter', hp: 80 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await adminPage.switchTab('journal')
    const pg = adminPage.page
    await expect(pg.locator('.journal')).toBeVisible({ timeout: 5_000 })

    // Stats block should be visible
    await expect(pg.locator('.session-stats')).toBeVisible({ timeout: 5_000 })
    // Three stat values: duration, damage, healing
    await expect(pg.locator('.session-stats .stat-value')).toHaveCount(3)

    // Capture damage stat BEFORE the player takes damage
    const damageStatBefore = await pg.locator('.session-stats .stat-value').nth(1).textContent()

    // Player takes damage — should update total damage stat
    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(60) // 20 damage
    await expect(async () => {
      const after = await pg.locator('.session-stats .stat-value').nth(1).textContent()
      expect(after).not.toBe(damageStatBefore)
    }).toPass({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('journal reset button clears events and resets stats', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Paladin', hp: 70 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    // Open journal tab BEFORE damage so socket listener is registered
    await adminPage.switchTab('journal')
    const pg = adminPage.page
    await expect(pg.locator('.journal')).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setHp(50) // generate damage event

    // Wait for a timeline event to appear
    await expect(pg.locator('.timeline-item')).not.toHaveCount(0, { timeout: 8_000 })

    // Click reset button (needs two clicks: first shows confirm, second confirms)
    await pg.locator('.reset-btn').click()
    await expect(pg.locator('.reset-confirm-btn')).toBeVisible({ timeout: 3_000 })
    await pg.locator('.reset-confirm-btn').click()

    // After reset, journal should be empty
    await expect(pg.locator('.timeline-item')).toHaveCount(0, { timeout: 8_000 })

    // Damage stat should be back to 0 or —
    const damageVal = await pg.locator('.session-stats .stat-value').nth(1).textContent()
    expect(damageVal?.trim()).toMatch(/^0$|^—$/)
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
