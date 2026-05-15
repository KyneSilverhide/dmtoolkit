import { Notice, Plugin } from 'obsidian';
import { io, Socket } from 'socket.io-client';
import { CriticalFailSettings, CriticalFailSettingTab, DEFAULT_SETTINGS } from './settings';

// Shape of a player as returned by Critical Fail
interface CFPlayer {
	id: number;
	player_name: string;
	current_hp: number;
	max_hp: number;
	ac: number;
	initiative: number | null;
	conditions: string[];
	is_concentrating: boolean;
	dnd_class: string;
	avatar_url: string;
}

// Minimal interface for the Initiative Tracker plugin API.
// Derived from javalent/initiative-tracker source.
interface InitiativeTrackerAPI {
	addCreature: (creature: {
		name: string;
		hp?: number;
		ac?: number;
		initiative?: number;
		player?: boolean;
	}) => void;
	removeCreature: (name: string) => void;
	updateCreature: (name: string, data: { hp?: number; initiative?: number }) => void;
	getEncounter: () => {
		creatures: Array<{
			name: string;
			hp: number;
			maxHp: number;
			initiative: number | null;
			player: boolean;
		}>;
	} | null;
	on: (event: string, cb: (...args: unknown[]) => void) => void;
	off: (event: string, cb: (...args: unknown[]) => void) => void;
}

export default class CriticalFailSync extends Plugin {
	settings!: CriticalFailSettings;
	private socket: Socket | null = null;
	private itApi: InitiativeTrackerAPI | null = null;
	private readonly playerIdToName = new Map<number, string>();

	// Handlers kept as instance properties so they can be removed on unload
	private readonly onITInitiativeChange = (name: string, initiative: number) => {
		this.pushInitiativeToCF(name, initiative);
	};

	private readonly onITHpChange = (name: string, hp: number) => {
		this.pushHpToCF(name, hp);
	};

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CriticalFailSettingTab(this.app, this));

		this.addCommand({
			id: 'connect',
			name: 'Connecter à Critical Fail',
			callback: () => this.connect(),
		});

		this.addCommand({
			id: 'disconnect',
			name: 'Déconnecter de Critical Fail',
			callback: () => this.disconnect(),
		});

		this.addCommand({
			id: 'sync-players',
			name: 'Synchroniser les joueurs CF → Initiative Tracker',
			callback: () => this.syncPlayersFromCF(),
		});

		if (this.settings.autoSync && this.settings.jwtToken && this.settings.sessionId) {
			this.app.workspace.onLayoutReady(() => this.connect());
		}
	}

	onunload() {
		this.disconnect();
	}

	// ── Connection ──────────────────────────────────────────────────────────────

	connect() {
		if (this.socket?.connected) {
			new Notice('Critical Fail Sync: déjà connecté.');
			return;
		}

		const { backendUrl, jwtToken, sessionId } = this.settings;
		if (!jwtToken || !sessionId) {
			new Notice('Critical Fail Sync: configure l\'URL, le token JWT et l\'ID de session d\'abord.');
			return;
		}

		this.socket = io(backendUrl, {
			auth: { token: jwtToken },
			reconnection: true,
		});

		this.socket.on('connect', () => {
			new Notice('Critical Fail Sync: connecté ✓');
			this.socket!.emit('admin-join', sessionId);
		});

		this.socket.on('connect_error', (err: Error) => {
			new Notice(`Critical Fail Sync: erreur de connexion — ${err.message}`);
		});

		this.socket.on('disconnect', () => {
			new Notice('Critical Fail Sync: déconnecté.');
		});

		// CF → IT: initial snapshot
		this.socket.on('players-snapshot', ({ players }: { players: CFPlayer[] }) => {
			this.populateIT(players);
		});

		// CF → IT: player joined
		this.socket.on('player-joined', (player: CFPlayer) => {
			this.upsertITCreature(player);
		});

		// CF → IT: player left
		this.socket.on('player-left', ({ playerId }: { playerId: number }) => {
			const name = this.playerIdToName.get(playerId);
			if (name) {
				this.itApi?.removeCreature(name);
				this.playerIdToName.delete(playerId);
			}
		});

		// CF → IT: HP updated
		this.socket.on('hp-updated', ({ playerId, newHp }: { playerId: number; newHp: number }) => {
			const name = this.playerIdToName.get(playerId);
			if (name) this.itApi?.updateCreature(name, { hp: newHp });
		});

		// CF → IT: initiative updated
		this.socket.on('initiative-updated', ({ playerId, initiative }: { playerId: number; initiative: number | null }) => {
			const name = this.playerIdToName.get(playerId);
			if (name && initiative !== null) {
				this.itApi?.updateCreature(name, { initiative });
			}
		});

		this.attachITListeners();
	}

	disconnect() {
		this.detachITListeners();
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
	}

	// ── IT helpers ──────────────────────────────────────────────────────────────

	private getITApi(): InitiativeTrackerAPI | null {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (this.app as any).plugins?.plugins;
		return (plugins?.['initiative-tracker'] as InitiativeTrackerAPI) ?? null;
	}

	private populateIT(players: CFPlayer[]) {
		this.itApi = this.getITApi();
		if (!this.itApi) {
			new Notice('Critical Fail Sync: Initiative Tracker introuvable. Installe et active le plugin.');
			return;
		}
		this.playerIdToName.clear();
		for (const p of players) {
			this.playerIdToName.set(p.id, p.player_name);
			this.upsertITCreature(p);
		}
		new Notice(`Critical Fail Sync: ${players.length} joueur(s) importé(s) dans l'Initiative Tracker.`);
	}

	private upsertITCreature(player: CFPlayer) {
		if (!this.itApi) this.itApi = this.getITApi();
		if (!this.itApi) return;
		this.playerIdToName.set(player.id, player.player_name);
		try {
			this.itApi.addCreature({
				name: player.player_name,
				hp: player.current_hp,
				ac: player.ac,
				initiative: player.initiative ?? undefined,
				player: true,
			});
		} catch {
			// addCreature may throw if the creature already exists — ignore
		}
	}

	private attachITListeners() {
		this.itApi = this.getITApi();
		if (!this.itApi || typeof this.itApi.on !== 'function') return;
		this.itApi.on('initiative-change', this.onITInitiativeChange);
		this.itApi.on('hp-change', this.onITHpChange);
	}

	private detachITListeners() {
		if (!this.itApi || typeof this.itApi.off !== 'function') return;
		this.itApi.off('initiative-change', this.onITInitiativeChange);
		this.itApi.off('hp-change', this.onITHpChange);
	}

	// ── IT → CF pushes ──────────────────────────────────────────────────────────

	private pushInitiativeToCF(playerName: string, initiative: number) {
		if (!this.socket?.connected || !this.settings.sessionId) return;
		this.socket.emit('obsidian-sync-initiatives', {
			sessionId: this.settings.sessionId,
			updates: [{ playerName, initiative }],
		});
	}

	private pushHpToCF(playerName: string, hp: number) {
		if (!this.socket?.connected || !this.settings.sessionId) return;
		this.socket.emit('admin-update-hp', {
			sessionId: this.settings.sessionId,
			playerName,
			currentHp: hp,
		});
	}

	// ── Manual sync via REST ────────────────────────────────────────────────────

	async syncPlayersFromCF() {
		const { backendUrl, jwtToken, sessionId } = this.settings;
		if (!jwtToken || !sessionId) {
			new Notice('Critical Fail Sync: token JWT et ID de session requis.');
			return;
		}
		try {
			const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/players`, {
				headers: { Authorization: `Bearer ${jwtToken}` },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const players = await res.json() as CFPlayer[];
			this.populateIT(players);
		} catch (err) {
			new Notice(`Critical Fail Sync: erreur lors de la récupération des joueurs — ${err}`);
		}
	}

	// ── Settings persistence ────────────────────────────────────────────────────

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CriticalFailSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
