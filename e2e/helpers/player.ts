import { Page } from '@playwright/test'

export interface PlayerOptions {
  name?: string
  hp?: number
  maxHp?: number
  ac?: number
  dndClass?: string
}

export async function joinAsPlayer(page: Page, code: string, opts: PlayerOptions = {}): Promise<void> {
  const {
    name = 'Thorin',
    hp = 40,
    maxHp,
    ac = 15,
    dndClass = 'Guerrier',
  } = opts

  await page.goto(`/join/${code}`)
  await page.getByTestId('player-name-input').fill(name)
  await page.getByTestId('hp-input').fill(String(maxHp ?? hp))
  await page.getByTestId('ac-input').fill(String(ac))
  const classSelect = page.getByTestId('class-select')
  if (await classSelect.count()) {
    await classSelect.selectOption({ label: dndClass }).catch(() => {})
  }
  await page.getByTestId('join-button').click()
  await page.waitForURL(/\/player\/|\/view\//, { timeout: 15_000 })
}
