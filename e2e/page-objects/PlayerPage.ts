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

  async getHp(): Promise<number> {
    const text = await this.getHpFraction().textContent()
    const match = text?.match(/-?\d+/)
    return match ? parseInt(match[0], 10) : 0
  }

  // Panneau « Dégâts et Soins » : un delta signé (positif = soin, négatif = dégâts) —
  // remplace l'ancien éditeur de PV absolu.
  async adjustHp(delta: number) {
    await this.page.getByTestId('damage-input').fill(String(delta))
    await this.page.getByTestId('damage-apply').click()
  }

  async setHp(value: number) {
    const current = await this.getHp()
    if (value !== current) await this.adjustHp(value - current)
  }

  async incrementHp(by: 1 | 5) {
    await this.page.getByTestId(`hp-plus-${by}`).click()
    await this.page.getByTestId('damage-apply').click()
  }

  async decrementHp(by: 1 | 5) {
    await this.page.getByTestId(`hp-minus-${by}`).click()
    await this.page.getByTestId('damage-apply').click()
  }

  async setInitiative(value: number) {
    await this.page.getByTestId('initiative-input').fill(String(value))
    await this.page.getByTestId('initiative-submit').click()
  }

  async setAc(value: number) {
    await this.page.getByTestId('ac-edit-input').fill(String(value))
    await this.page.getByTestId('ac-submit').click()
  }

  async setTempHp(value: number) {
    await this.page.getByTestId('temp-hp-edit-btn').click()
    await this.page.getByTestId('temp-hp-edit-input').fill(String(value))
    await this.page.getByTestId('temp-hp-submit').click()
  }

  async applyDamage(amount: number) {
    await this.adjustHp(-amount)
  }

  async toggleCondition(conditionId: string) {
    await this.page.getByTestId(`condition-${conditionId}`).click()
  }

  async toggleConcentration() {
    await this.page.getByTestId('concentration-toggle').click()
  }

  // Depuis la refonte UI, les familles de contenu ne sont plus des entrées de navigation :
  // elles vivent derrière l'écran d'index « Grimoire ». Leurs clés d'onglet (et donc leurs
  // URL) sont inchangées, seul le chemin pour y arriver demande un saut supplémentaire.
  // 'magic' est volontairement absent : les objets magiques ne sont pas consultables par
  // les joueurs (voir PlayerGrimoireIndex.vue côté frontend).
  private static readonly GRIMOIRE_TABS = [
    'spells', 'equipment', 'races', 'classes', 'backgrounds', 'abilities', 'services', 'conditions',
  ]

  async switchTab(tab: 'combat' | 'des' | 'notes' | 'grimoire' | 'spells' | 'equipment' | 'races' | 'classes' | 'backgrounds' | 'abilities' | 'services' | 'conditions' | 'boutique' | 'vote' | 'messages') {
    if (PlayerPage.GRIMOIRE_TABS.includes(tab)) {
      await this.page.getByTestId('player-tab-grimoire').click()
      await this.page.getByTestId(`grimoire-entry-${tab}`).click()
      return
    }
    await this.page.getByTestId(`player-tab-${tab}`).click()
  }

  async leave() {
    await this.page.getByTestId('leave-button').click()
  }
}
