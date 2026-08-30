import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test('player sets temp HP and admin sees it, base HP unaffected', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Warlock', hp: 15, maxHp: 30 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setTempHp(5)

    await expect(adminPage.page.getByTestId(`player-temp-hp-${playerId}`)).toContainText('5', { timeout: 8_000 })
    // Le PV de base ne doit pas bouger — 15/30 avant et après (bug historique : temp HP
    // ne pouvait s'obtenir qu'en dépassant max_hp).
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('15', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('damage (negative delta) is absorbed by temp HP first', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Cleric', hp: 20, maxHp: 20 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setTempHp(5)
    await expect(adminPage.page.getByTestId(`player-temp-hp-${playerId}`)).toContainText('5', { timeout: 8_000 })

    // -3 : entièrement absorbé par les PV temp, PV de base inchangé.
    await playerPage.adjustHp(-3)
    await expect(adminPage.page.getByTestId(`player-temp-hp-${playerId}`)).toContainText('2', { timeout: 8_000 })
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('20', { timeout: 8_000 })

    // -5 supplémentaires : 2 PV temp restants absorbent, 3 passent sur le PV de base.
    await playerPage.adjustHp(-5)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('17', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('healing (positive delta) never touches temp HP and is capped at max HP', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Ranger', hp: 15, maxHp: 20 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setTempHp(4)
    await expect(adminPage.page.getByTestId(`player-temp-hp-${playerId}`)).toContainText('4', { timeout: 8_000 })

    // +10 soin : plafonné à max_hp (20), les PV temp ne bougent pas.
    await playerPage.adjustHp(10)
    await expect(adminPage.page.getByTestId(`player-hp-${playerId}`)).toContainText('20', { timeout: 8_000 })
    await expect(adminPage.page.getByTestId(`player-temp-hp-${playerId}`)).toContainText('4', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})
