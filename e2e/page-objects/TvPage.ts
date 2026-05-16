import { Page, Locator } from '@playwright/test'

export class TvPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(code: string) {
    await this.page.goto(`/tv/${code}`)
    await this.page.getByTestId('tv-container').waitFor()
  }

  getMode(): Locator {
    return this.page.getByTestId('tv-container')
  }

  getCurrentMode(): Promise<string | null> {
    return this.page.getByTestId('tv-container').getAttribute('data-tv-mode')
  }

  getLobbyDisplay(): Locator {
    return this.page.getByTestId('tv-mode-lobby')
  }

  getSessionCode(): Locator {
    return this.page.getByTestId('tv-session-code')
  }

  getCombatRound(): Locator {
    return this.page.getByTestId('tv-round')
  }

  getPlayerCard(playerId: number): Locator {
    return this.page.getByTestId(`tv-player-card-${playerId}`)
  }

  getVoteQuestion(): Locator {
    return this.page.getByTestId('tv-vote-question')
  }

  getDoomTimer(): Locator {
    return this.page.getByTestId('tv-doom-timer')
  }

  getTensionDisplay(): Locator {
    return this.page.getByTestId('tv-mode-tension')
  }

  getImageDisplay(): Locator {
    return this.page.getByTestId('tv-mode-image')
  }

  getMapDisplay(): Locator {
    return this.page.getByTestId('tv-mode-map')
  }

  getMerchantDisplay(): Locator {
    return this.page.getByTestId('tv-mode-merchant')
  }
}
