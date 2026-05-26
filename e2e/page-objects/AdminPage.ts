import { Page, Locator, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth'

export class AdminPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async login(token: string) {
    // Ensure generatorEnabled is true regardless of server GITHUB_TOKEN setting,
    // so tests don't depend on an environment variable that is absent in CI.
    await this.page.route('**/api/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ generatorEnabled: true, demoEnabled: false }),
      })
    )
    await loginAsAdmin(this.page, token)
  }

  async selectSession(code: string) {
    // Sessions are listed; click the one matching the code
    await this.page.getByText(code).first().click()
  }

  async switchTab(key: string) {
    await this.page.getByTestId(`tab-${key}`).click()
  }

  async setTvMode(mode: string) {
    await this.page.getByTestId(`tv-mode-btn-${mode}`).click()
  }

  getPlayerRow(playerId: number): Locator {
    return this.page.getByTestId(`player-row-${playerId}`)
  }

  getPlayerHp(playerId: number): Locator {
    return this.page.getByTestId(`player-hp-${playerId}`)
  }

  getPlayerName(playerId: number): Locator {
    return this.page.getByTestId(`player-name-${playerId}`)
  }

  getKickButton(playerId: number): Locator {
    return this.page.getByTestId(`kick-button-${playerId}`)
  }

  async getFirstPlayerId(): Promise<number> {
    const row = this.page.locator('[data-testid^="player-row-"]').first()
    await expect(row).toBeVisible()
    const testId = await row.getAttribute('data-testid')
    if (!testId) throw new Error('player-row testid not found')
    return Number(testId.replace('player-row-', ''))
  }

  async kickPlayer(playerId: number) {
    this.page.once('dialog', (d) => d.accept())
    await this.getKickButton(playerId).click()
  }
}
