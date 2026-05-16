import { Page, Locator } from '@playwright/test'
import { joinAsPlayer, PlayerOptions } from '../helpers/player'

export class PlayerPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async join(code: string, opts?: PlayerOptions) {
    await joinAsPlayer(this.page, code, opts)
  }

  getHpFraction(): Locator {
    return this.page.getByTestId('hp-fraction')
  }

  async setHp(value: number) {
    await this.page.getByTestId('hp-input').fill(String(value))
    await this.page.getByTestId('hp-submit').click()
  }

  async incrementHp(by: 1 | 5) {
    await this.page.getByTestId(`hp-plus-${by}`).click()
    await this.page.getByTestId('hp-submit').click()
  }

  async decrementHp(by: 1 | 5) {
    await this.page.getByTestId(`hp-minus-${by}`).click()
    await this.page.getByTestId('hp-submit').click()
  }

  async setInitiative(value: number) {
    await this.page.getByTestId('initiative-input').fill(String(value))
    await this.page.getByTestId('initiative-submit').click()
  }

  async toggleCondition(conditionId: string) {
    await this.page.getByTestId(`condition-${conditionId}`).click()
  }

  async toggleConcentration() {
    await this.page.getByTestId('concentration-toggle').click()
  }

  async switchTab(tab: 'combat' | 'des' | 'notes' | 'sorts' | 'objets' | 'boutique' | 'vote' | 'messages') {
    await this.page.getByTestId(`player-tab-${tab}`).click()
  }

  async leave() {
    await this.page.getByTestId('leave-button').click()
  }
}
