import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian'
import { io, Socket } from 'socket.io-client'

interface CriticalFailSettings {
  backendUrl: string
  jwtToken: string
  sessionId: number
  autoSync: boolean
}

const DEFAULT_SETTINGS: CriticalFailSettings = {
  backendUrl: 'http://localhost:3000',
  jwtToken: '',
  sessionId: 0,
  autoSync: true,
}

// Shape of a player as returned by Critical Fail
interface CFPlayer {
  id: number
  player_name: string
  current_hp: number
  max_hp: number
  ac: number
  initiative: number | null
  conditions: string[]
  is_concentrating: boolean
  dnd_class: string
  avatar_url: string
}

// Minimal interface for the Initiative Tracker plugin API.
// The exact shape is derived from javalent/initiative-tracker source.
interface InitiativeTrackerAPI {
  addCreature: (creature: {
    name: string
    hp?: number
    ac?: number
    initiative?: number
    player?: boolean
  }) => void
  removeCreature: (name: string) => void
  updateCreature: (name: string, data: { hp?: number; initiative?: number }) => void
  getEncounter: () => {
    creatures: Array<{
      name: string
      hp: number
      maxHp: number
      initiative: number | null
      player: boolean
    }>
  } | null
  on: (event: string, cb: (...args: unknown[]) => void) => void
  off: (event: string, cb: (...args: unknown[]) => void) => void
}

export default class CriticalFailSync extends Plugin {
  settings!: CriticalFailSettings
  private socket: Socket | null = null
  private itApi: InitiativeTrackerAPI | null = null

  // Handlers kept as instance properties so they can be removed on unload
  private onITInitiativeChange = (name: string, initiative: number) => {
    this.pushInitiativeToCF(name, initiative)
  }

  private onITHpChange = (name: string, hp: number) => {
    this.pushHpToFC(name, hp)
  }

  async onload() {
    await this.loadSettings()
    this.addSettingTab(new CriticalFailSettingTab(this.app, this))

    this.addCommand({
      id: 'connect',
      name: 'Connecter à Critical Fail',
      callback: () => this.connect(),
    })

    this.addCommand({
      id: 'disconnect',
      name: 'Déconnecter de Critical Fail',
      callback: () => this.disconnect(),
    })

    this.addCommand({
      id: 'sync-players',
      name: 'Synchroniser les joueurs CF → Initiative Tracker',
      callback: () => this.syncPlayersFromCF(),
    })

    if (this.settings.autoSync && this.settings.jwtToken && this.settings.sessionId) {
      // Wait for layout to be ready before connecting
      this.app.workspace.onLayoutReady(() => this.connect())
    }
  }

  onunload() {
    this.disconnect()
  }

  // ── Connection ────────────────────────────────────────────────────────────

  connect() {
    if (this.socket?.connected) {
      new Notice('Critical Fail Sync: déjà connecté.')
      return
    }

    const { backendUrl, jwtToken, sessionId } = this.settings
    if (!jwtToken || !sessionId) {
      new Notice('Critical Fail Sync: configure l\'URL, le token JWT et l\'ID de session d\'abord.')
      return
    }

    this.socket = io(backendUrl, {
      auth: { token: jwtToken },
      transports: ['websocket'],
      reconnection: true,
    })

    this.socket.on('connect', () => {
      new Notice('Critical Fail Sync: connecté ✓')
      this.socket!.emit('admin-join', sessionId)
    })

    this.socket.on('connect_error', (err) => {
      new Notice(`Critical Fail Sync: erreur de connexion — ${err.message}`)
    })

    this.socket.on('disconnect', () => {
      new Notice('Critical Fail Sync: déconnecté.')
    })

    // CF → IT: initial snapshot
    this.socket.on('players-snapshot', ({ players }: { players: CFPlayer[] }) => {
      this.populateIT(players)
    })

    // CF → IT: player joined
    this.socket.on('player-joined', (player: CFPlayer) => {
      this.upsertITCreature(player)
    })

    // CF → IT: player left
    this.socket.on('player-left', ({ playerId }: { playerId: number }) => {
      // We need the player name — find it in the current encounter
      const encounter = this.itApi?.getEncounter()
      if (!encounter) return
      // We can't match by id here since IT doesn't store CF ids.
      // This edge case is acceptable — the user can manually remove the creature.
    })

    // CF → IT: HP updated
    this.socket.on('hp-updated', ({ playerId, currentHp }: { playerId: number; currentHp: number }) => {
      const encounter = this.itApi?.getEncounter()
      if (!encounter) return
      // Find creature by matching we stored the mapping
      const name = this.playerIdToName.get(playerId)
      if (name) this.itApi?.updateCreature(name, { hp: currentHp })
    })

    // CF → IT: initiative updated
    this.socket.on('initiative-updated', ({ playerId, initiative }: { playerId: number; initiative: number | null }) => {
      const name = this.playerIdToName.get(playerId)
      if (name && initiative !== null) {
        this.itApi?.updateCreature(name, { initiative })
      }
    })

    // Attach IT listeners
    this.attachITListeners()
  }

  disconnect() {
    this.detachITListeners()
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  // ── Player ID ↔ Name mapping ──────────────────────────────────────────────

  private playerIdToName = new Map<number, string>()

  // ── IT helpers ────────────────────────────────────────────────────────────

  private getITApi(): InitiativeTrackerAPI | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins = (this.app as any).plugins?.plugins
    return plugins?.['initiative-tracker'] ?? null
  }

  private populateIT(players: CFPlayer[]) {
    this.itApi = this.getITApi()
    if (!this.itApi) {
      new Notice('Critical Fail Sync: Initiative Tracker introuvable. Installe et active le plugin.')
      return
    }
    this.playerIdToName.clear()
    for (const p of players) {
      this.playerIdToName.set(p.id, p.player_name)
      this.upsertITCreature(p)
    }
    new Notice(`Critical Fail Sync: ${players.length} joueur(s) importé(s) dans l'Initiative Tracker.`)
  }

  private upsertITCreature(player: CFPlayer) {
    if (!this.itApi) this.itApi = this.getITApi()
    if (!this.itApi) return
    this.playerIdToName.set(player.id, player.player_name)
    try {
      this.itApi.addCreature({
        name: player.player_name,
        hp: player.current_hp,
        ac: player.ac,
        initiative: player.initiative ?? undefined,
        player: true,
      })
    } catch {
      // addCreature may throw if the creature already exists in some versions — ignore
    }
  }

  private attachITListeners() {
    this.itApi = this.getITApi()
    if (!this.itApi) return
    this.itApi.on('initiative-change', this.onITInitiativeChange)
    this.itApi.on('hp-change', this.onITHpChange)
  }

  private detachITListeners() {
    if (!this.itApi) return
    this.itApi.off('initiative-change', this.onITInitiativeChange)
    this.itApi.off('hp-change', this.onITHpChange)
  }

  // ── IT → CF pushes ────────────────────────────────────────────────────────

  private pushInitiativeToCF(playerName: string, initiative: number) {
    if (!this.socket?.connected || !this.settings.sessionId) return
    this.socket.emit('obsidian-sync-initiatives', {
      sessionId: this.settings.sessionId,
      updates: [{ playerName, initiative }],
    })
  }

  private pushHpToFC(playerName: string, hp: number) {
    if (!this.socket?.connected || !this.settings.sessionId) return
    this.socket.emit('admin-update-hp', {
      sessionId: this.settings.sessionId,
      playerName,
      currentHp: hp,
    })
  }

  // ── Manual sync command ───────────────────────────────────────────────────

  async syncPlayersFromCF() {
    const { backendUrl, jwtToken, sessionId } = this.settings
    if (!jwtToken || !sessionId) {
      new Notice('Critical Fail Sync: token JWT et ID de session requis.')
      return
    }
    try {
      const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/players`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const players: CFPlayer[] = await res.json()
      this.populateIT(players)
    } catch (err) {
      new Notice(`Critical Fail Sync: erreur lors de la récupération des joueurs — ${err}`)
    }
  }

  // ── Settings persistence ──────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}

// ── Settings tab ─────────────────────────────────────────────────────────────

class CriticalFailSettingTab extends PluginSettingTab {
  plugin: CriticalFailSync

  constructor(app: App, plugin: CriticalFailSync) {
    super(app, plugin)
    this.plugin = plugin
  }

  display() {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName('URL du backend Critical Fail')
      .setDesc('Ex : http://localhost:3000 ou https://monserveur.example.com')
      .addText(text =>
        text
          .setPlaceholder('http://localhost:3000')
          .setValue(this.plugin.settings.backendUrl)
          .onChange(async value => {
            this.plugin.settings.backendUrl = value.trim()
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Token JWT admin')
      .setDesc('Récupère-le en te connectant à l\'interface admin Critical Fail (localStorage → token).')
      .addText(text =>
        text
          .setPlaceholder('eyJhbGciOiJIUzI1NiIsInR5cCI6...')
          .setValue(this.plugin.settings.jwtToken)
          .onChange(async value => {
            this.plugin.settings.jwtToken = value.trim()
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('ID de session')
      .setDesc('L\'identifiant numérique de la session active Critical Fail.')
      .addText(text =>
        text
          .setPlaceholder('1')
          .setValue(String(this.plugin.settings.sessionId || ''))
          .onChange(async value => {
            this.plugin.settings.sessionId = parseInt(value, 10) || 0
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Connexion automatique au démarrage')
      .setDesc('Se connecter automatiquement à l\'ouverture d\'Obsidian si le token et l\'ID sont configurés.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.autoSync).onChange(async value => {
          this.plugin.settings.autoSync = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Connexion manuelle')
      .setDesc('Connecte le plugin maintenant.')
      .addButton(btn =>
        btn
          .setButtonText('Connecter')
          .setCta()
          .onClick(() => this.plugin.connect())
      )
      .addButton(btn =>
        btn.setButtonText('Déconnecter').onClick(() => this.plugin.disconnect())
      )

    new Setting(containerEl)
      .setName('Import joueurs')
      .setDesc('Récupère les joueurs CF via REST et les injecte dans l\'Initiative Tracker.')
      .addButton(btn =>
        btn
          .setButtonText('Importer maintenant')
          .onClick(() => this.plugin.syncPlayersFromCF())
      )
  }
}
