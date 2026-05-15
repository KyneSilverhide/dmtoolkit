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

// Loose interface — we check each method at runtime because the IT API
// shape varies across plugin versions and may live at plugin or plugin.api.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InitiativeTrackerAPI = Record<string, any>;

export default class CriticalFailSync extends Plugin {
	settings!: CriticalFailSettings;
	private socket: Socket | null = null;
	// plugin.api  → addCreatures / newEncounter
	// plugin.tracker → updateCreatureByName
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private itPlugin: any = null;
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
				this.removeITCreature(name);
				this.playerIdToName.delete(playerId);
			}
		});

		// CF → IT: HP updated
		this.socket.on('hp-updated', ({ playerId, newHp }: { playerId: number; newHp: number }) => {
			const name = this.playerIdToName.get(playerId);
			if (name) this.applyITUpdate(name, { hp: newHp });
		});

		// CF → IT: initiative updated
		this.socket.on('initiative-updated', ({ playerId, initiative }: { playerId: number; initiative: number | null }) => {
			const name = this.playerIdToName.get(playerId);
			if (name && initiative !== null) {
				this.applyITUpdate(name, { initiative });
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private getITPlugin(): any {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (this.app as any).plugins?.plugins;
		return plugins?.['initiative-tracker'] ?? null;
	}

	private populateIT(players: CFPlayer[]) {
		const it = this.getITPlugin();
		if (!it) {
			new Notice('Critical Fail Sync: Initiative Tracker introuvable. Installe et active le plugin.');
			return;
		}
		this.playerIdToName.clear();
		const creatures = players.map(p => {
			this.playerIdToName.set(p.id, p.player_name);
			return {
				name: p.player_name,
				hp: p.current_hp,
				max: p.max_hp,
				ac: p.ac,
				initiative: p.initiative ?? undefined,
				player: true,
			};
		});
		try {
			// Start a fresh encounter then inject all players
			if (typeof it.api?.newEncounter === 'function') {
				it.api.newEncounter();
			}
			if (typeof it.api?.addCreatures === 'function') {
				it.api.addCreatures(creatures);
			}
		} catch (err) {
			console.error('[CF Sync] populateIT error:', err);
		}
		new Notice(`Critical Fail Sync: ${players.length} joueur(s) importé(s) dans l'Initiative Tracker.`);
	}

	private upsertITCreature(player: CFPlayer) {
		const it = this.getITPlugin();
		if (!it) return;

		const alreadyTracked = this.playerIdToName.has(player.id);
		this.playerIdToName.set(player.id, player.player_name);

		if (alreadyTracked) {
			// Player reconnected or stats were updated — update in place, no duplicate
			this.applyITUpdate(player.player_name, {
				hp: player.current_hp,
				max: player.max_hp,
				ac: player.ac,
				initiative: player.initiative ?? undefined,
			});
			return;
		}

		// Truly new player: add to IT.
		// If a creature with the same name already exists in IT (e.g. after plugin reload),
		// addCreatures may create a duplicate — the user can run a full re-sync to fix that.
		try {
			if (typeof it.api?.addCreatures === 'function') {
				it.api.addCreatures([{
					name: player.player_name,
					hp: player.current_hp,
					max: player.max_hp,
					ac: player.ac,
					initiative: player.initiative ?? undefined,
					player: true,
				}]);
			}
		} catch (err) {
			console.warn('[CF Sync] upsertITCreature error:', err);
		}
	}

	private removeITCreature(_name: string) {
		// removeCreature is not exposed in the current IT API — no-op.
	}

	// Documented API: plugin.tracker.updateCreatureByName(name, update)
	// See https://plugins.javalent.com/it/tracker/api
	private applyITUpdate(name: string, data: { hp?: number; max?: number; ac?: number | string; initiative?: number }) {
		const it = this.getITPlugin();
		if (!it) return;
		try {
			if (typeof it.tracker?.updateCreatureByName === 'function') {
				it.tracker.updateCreatureByName(name, data);
			}
		} catch (err) {
			console.warn('[CF Sync] applyITUpdate error:', err);
		}
	}

	private attachITListeners() {
		// IT does not expose an event API in the current version.
		// IT → CF sync is therefore not available (CF is the source of truth).
	}

	private detachITListeners() {
		// Nothing to detach.
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
