import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { joinAsPlayer } from '../helpers/player'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'

test('player sets AC and admin sees it', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const playerCtx = await browser.newContext()

  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const playerPg = await playerCtx.newPage()
    await joinAsPlayer(playerPg, code, { name: 'Barbarian', hp: 40 })

    const playerId = await adminPage.getFirstPlayerId()

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setAc(17)

    await expect(adminPage.page.getByTestId(`player-ac-${playerId}`)).toContainText('17', { timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await playerCtx.close()
  }
})

test('AC minimum is 1', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Squishy', hp: 20 })

  await page.getByTestId('ac-edit-input').fill('-5')
  await page.getByTestId('ac-submit').click()

  const input = page.getByTestId('ac-edit-input')
  await expect(input).not.toHaveValue('-5', { timeout: 8_000 })
  const val = await input.inputValue()
  expect(Number(val)).toBeGreaterThanOrEqual(1)
})

test('AC maximum is 30', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)
  await joinAsPlayer(page, code, { name: 'Tanky', hp: 20 })

  await page.getByTestId('ac-edit-input').fill('999')
  await page.getByTestId('ac-submit').click()

  const input = page.getByTestId('ac-edit-input')
  await expect(input).not.toHaveValue('999', { timeout: 8_000 })
  const val = await input.inputValue()
  expect(Number(val)).toBeLessThanOrEqual(30)
})

test('AC shown in TV combat mode', async ({ browser, adminToken }) => {
  const token = adminToken
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
    await joinAsPlayer(playerPg, code, { name: 'Paladin', hp: 30 })
    await expect(tvPage.page.getByText('Paladin')).toBeVisible({ timeout: 8_000 })

    const playerPage = new PlayerPage(playerPg)
    await playerPage.setAc(19)
    await expect(tvPage.page.getByText('19')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
    await playerCtx.close()
  }
})
