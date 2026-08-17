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

  // Depuis la refonte UI, les 24 clés d'onglet sont groupées par domaine dans le rail
  // (AdminNavSidebar.vue) : seul le domaine actif est déplié (`v-show`), les autres
  // `tab-<key>` existent dans le DOM mais restent invisibles tant qu'on n'a pas ouvert
  // leur domaine parent — sans ce garde-fou, .click() attend un élément qui ne devient
  // jamais visible et le test time out. On dérive le testid du domaine depuis le DOM
  // (closest .rail-domain) plutôt que de dupliquer la table DOMAINS ici, pour rester
  // valide même si les regroupements changent côté composant.
  async switchTab(key: string) {
    const tab = this.page.getByTestId(`tab-${key}`)
    if (!(await tab.isVisible().catch(() => false))) {
      const domainTestId = await tab.evaluate(
        (el) => el.closest('.rail-domain')?.querySelector('[data-testid^="domain-"]')?.getAttribute('data-testid') || null
      )
      if (domainTestId) {
        await this.page.getByTestId(domainTestId).click()
        await tab.waitFor({ state: 'visible' })
      }
    }
    await tab.click()
  }

  // Depuis la refonte UI, les modes TV vivent dans le sélecteur de la barre de scène
  // (AdminSceneBar.vue) au lieu d'une colonne latérale toujours dépliée : il faut l'ouvrir
  // avant de cliquer. Les data-testid `tv-mode-btn-<key>` sont inchangés.
  async openTvModePicker() {
    const picker = this.page.getByTestId('tv-mode-btn-lobby')
    if (await picker.isVisible().catch(() => false)) return
    await this.page.getByTestId('scene-change-mode').click()
    await picker.waitFor({ state: 'visible' })
  }

  async setTvMode(mode: string) {
    await this.openTvModePicker()
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
