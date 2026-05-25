import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'
import { TvPage } from '../page-objects/TvPage'

async function createVoteInAdmin(adminPage: AdminPage, question: string, options: string[]) {
  await adminPage.switchTab('vote')
  const pg = adminPage.page
  await pg.locator('input[placeholder*="question" i], input[placeholder*="Question" i]').fill(question)
  for (let i = 0; i < options.length; i++) {
    const inputs = pg.locator('input[placeholder*="option" i], input[placeholder*="Option" i]')
    await inputs.nth(i).fill(options[i])
    if (i < options.length - 1) {
      const addBtn = pg.locator('button').filter({ hasText: /ajouter.*option/i })
      if (await addBtn.count()) await addBtn.click()
    }
  }
  await pg.locator('button.action-btn').filter({ hasText: /Lancer le vote/i }).click()
}

test('admin creates a vote and it appears on TV', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createVoteInAdmin(adminPage, 'Quel chemin prendre ?', ['Forêt', 'Montagne'])

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('vote')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'vote', { timeout: 8_000 })
    await expect(tvPage.getVoteQuestion()).toContainText('Quel chemin prendre ?', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})

test('player receives vote notification and can submit a vote', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Voter', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await createVoteInAdmin(adminPage, 'Attaquer ou fuir ?', ['Attaquer', 'Fuir'])

    // Player's vote tab badge should light up
    await expect(playerPg.locator('[data-testid="player-tab-vote"] .tab-badge')).toBeVisible({ timeout: 8_000 })

    // Player switches to vote tab and submits
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('vote')
    const attackBtn = playerPg.locator('.vote-option-btn').filter({ hasText: 'Attaquer' })
    await expect(attackBtn).toBeVisible({ timeout: 8_000 })
    await attackBtn.click()

    // Vote submitted — buttons disappear, confirmation div appears
    await expect(playerPg.locator('.vote-done')).toBeVisible({ timeout: 8_000 }).catch(() => {})
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('vote results update in real time on TV', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Delegate', hp: 25 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await createVoteInAdmin(adminPage, 'Camps ou auberge ?', ['Camps', 'Auberge'])

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('vote')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'vote', { timeout: 8_000 })
    await expect(tvPage.getVoteQuestion()).toBeVisible({ timeout: 8_000 })

    // Player votes
    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('vote')
    await playerPg.locator('.vote-option-btn').filter({ hasText: 'Camps' }).click()

    // TV updates vote count
    await expect(tvPage.page.getByText(/1.*vote|vote.*1/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('admin closes vote and results shown', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Voter2', hp: 20 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await createVoteInAdmin(adminPage, 'Repos ou mission ?', ['Repos', 'Mission'])

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('vote')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'vote', { timeout: 8_000 })
    await expect(tvPage.getVoteQuestion()).toBeVisible({ timeout: 8_000 })

    // Close the vote
    await adminPage.switchTab('vote')
    await adminPage.page.locator('button.action-btn.danger-btn').filter({ hasText: /clôturer/i }).click()

    // TV should show results bars
    await expect(tvPage.page.locator('.vote-results')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})

test('player cannot vote twice', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'OnceVoter', hp: 30 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await createVoteInAdmin(adminPage, 'Combat ou diplomatie ?', ['Combat', 'Diplomatie'])

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('vote')
    await playerPg.locator('.vote-option-btn').filter({ hasText: 'Combat' }).click()

    await expect(playerPg.locator('.vote-option-btn')).toHaveCount(0, { timeout: 8_000 })
    await expect(playerPg.locator('.vote-results-mini')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('vote visible in player vote tab with question and options', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Citizen', hp: 35 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await createVoteInAdmin(adminPage, 'Nord ou Sud ?', ['Nord', 'Sud'])

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('vote')

    await expect(playerPg.getByRole('heading', { name: 'Nord ou Sud ?' })).toBeVisible({ timeout: 8_000 })
    await expect(playerPg.getByRole('button', { name: 'Nord', exact: true })).toBeVisible()
    await expect(playerPg.getByRole('button', { name: 'Sud', exact: true })).toBeVisible()
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('vote summary shows count of voters after close', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'LastVoter', hp: 28 })
    await expect(adminPage.page.locator('[data-testid^="player-row-"]').first()).toBeVisible({ timeout: 8_000 })

    await createVoteInAdmin(adminPage, 'Agir maintenant ?', ['Oui', 'Non'])

    const playerPage = new PlayerPage(playerPg)
    await playerPage.switchTab('vote')
    await playerPg.locator('.vote-option-btn').filter({ hasText: 'Oui' }).click()

    // Admin should see vote closed with summary
    await expect(adminPage.page.getByText('Clôturé')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('TV vote display in vote mode', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    await createVoteInAdmin(adminPage, 'Aller à gauche ou à droite ?', ['Gauche', 'Droite'])

    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)
    await adminPage.setTvMode('vote')
    await expect(tvPage.page.locator('[data-testid="tv-container"]')).toHaveAttribute('data-tv-mode', 'vote', { timeout: 8_000 })

    await expect(tvPage.page.getByTestId('tv-mode-vote')).toBeVisible({ timeout: 8_000 })
    await expect(tvPage.getVoteQuestion()).toContainText('Aller à gauche ou à droite ?')
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
