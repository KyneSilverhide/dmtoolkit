import { test, expect } from '../fixtures'
import { getAdminToken } from '../helpers/auth'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test('player sets initiative and admin sees it', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Ranger', hp: 40 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setInitiative(18)

    await expect(adminPage.page.getByTestId(`player-initiative-${playerId}`)).toContainText('18', { timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('initiative minimum is -10', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Slowpoke', hp: 20 })

  // Try to set initiative below minimum
  await page.getByTestId('initiative-input').fill('-100')
  await page.getByTestId('initiative-submit').click()

  // Wait for server to confirm and update the input value
  const input = page.getByTestId('initiative-input')
  await expect(input).not.toHaveValue('-100', { timeout: 5_000 })
  const val = await input.inputValue()
  // The input has min=-10 attribute or backend clamps
  expect(Number(val)).toBeGreaterThanOrEqual(-10)
})

test('initiative maximum is 99', async ({ page }) => {
  const token = await getAdminToken()
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Speedster', hp: 20 })

  await page.getByTestId('initiative-input').fill('999')
  await page.getByTestId('initiative-submit').click()

  const input = page.getByTestId('initiative-input')
  await expect(input).not.toHaveValue('999', { timeout: 5_000 })
  const val = await input.inputValue()
  expect(Number(val)).toBeLessThanOrEqual(99)
})

test('initiative shown in TV combat mode', async ({ browser }) => {
  const token = await getAdminToken()
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.setTvMode('combat')

    const { TvPage } = await import('../page-objects/TvPage')
    const tvPage = new TvPage(await tvCtx.newPage())
    await tvPage.goto(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Quickdraw', hp: 30 })
    await expect(tvPage.page.getByText('Quickdraw')).toBeVisible({ timeout: 5_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setInitiative(22)
    await expect(tvPage.page.getByText('22')).toBeVisible({ timeout: 5_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})
