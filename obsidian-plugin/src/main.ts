import { Notice, Plugin } from 'obsidian';
import { io, Socket } from 'socket.io-client';
import { DmToolkitSettings, DmToolkitSettingTab, DEFAULT_SETTINGS } from './settings';

// Shape of a player as returned by DM Toolkit
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

export default class DmToolkitSync extends Plugin {
	settings!: DmToolkitSettings;
	private socket: Socket | null = null;
	// plugin.api  → addCreatures / newEncounter
	// plugin.tracker → updateCreatureByName
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private itPlugin: any = null;
	/** id → player_name, used to map socket events to IT creature names */
	private readonly playerIdToName = new Map<number, string>();
	/** id → max_hp, tracked locally to avoid IT's additive max bug */
	private readonly playerIdToMaxHp = new Map<number, number>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DmToolkitSettingTab(this.app, this));

		this.addCommand({
			id: 'connect',
			name: 'Connecter à DM Toolkit',
			callback: () => this.connect(),
		});

		this.addCommand({
			id: 'disconnect',
			name: 'Déconnecter de DM Toolkit',
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
			new Notice('DM Toolkit Sync: déjà connecté.');
			return;
		}

		const { backendUrl, jwtToken, sessionId } = this.settings;
		if (!jwtToken || !sessionId) {
			new Notice('DM Toolkit Sync: configure l\'URL, le token JWT et l\'ID de session d\'abord.');
			return;
		}

		this.socket = io(backendUrl, {
			auth: { token: jwtToken },
			reconnection: true,
		});

		this.socket.on('connect', () => {
			new Notice('DM Toolkit Sync: connecté ✓');
			this.socket!.emit('admin-join', sessionId);
		});

		this.socket.on('connect_error', (err: Error) => {
			new Notice(`DM Toolkit Sync: erreur de connexion — ${err.message}`);
		});

		this.socket.on('disconnect', () => {
			new Notice('DM Toolkit Sync: déconnecté.');
		});

		// DM Toolkit → IT: initial snapshot
		this.socket.on('players-snapshot', ({ players }: { players: CFPlayer[] }) => {
			this.populateIT(players);
		});

		// DM Toolkit → IT: player joined (new or reconnect)
		this.socket.on('player-joined', (player: CFPlayer) => {
			this.upsertITCreature(player);
		});

		// DM Toolkit → IT: player left
		this.socket.on('player-left', ({ playerId }: { playerId: number }) => {
			this.playerIdToName.delete(playerId);
			this.playerIdToMaxHp.delete(playerId);
			// removeCreature is not exposed in the current IT API — no-op.
		});

		// DM Toolkit → IT: HP updated — fast path
		this.socket.on('hp-updated', ({ playerId, newHp }: { playerId: number; newHp: number }) => {
			const name = this.playerIdToName.get(playerId);
			if (name) this.applyITUpdate(name, { hp: newHp });
		});

		// DM Toolkit → IT: initiative updated — fast path
		this.socket.on('initiative-updated', ({ playerId, initiative }: { playerId: number; initiative: number | null }) => {
			const name = this.playerIdToName.get(playerId);
			if (name && initiative !== null) {
				this.applyITUpdate(name, { initiative });
			}
		});
	}

	disconnect() {
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

	/** Initial load: clears caches, rebuilds encounter from scratch, shows Notice. */
	private populateIT(players: CFPlayer[]) {
		const it = this.getITPlugin();
		if (!it) {
			new Notice('DM Toolkit Sync: Initiative Tracker introuvable. Installe et active le plugin.');
			return;
		}
		this.playerIdToName.clear();
		this.playerIdToMaxHp.clear();
		const creatures = players.map(p => {
			this.playerIdToName.set(p.id, p.player_name);
			this.playerIdToMaxHp.set(p.id, p.max_hp);
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
			if (typeof it.api?.newEncounter === 'function') it.api.newEncounter();
			if (typeof it.api?.addCreatures === 'function') it.api.addCreatures(creatures);
		} catch (err) {
			console.error('[DM Toolkit Sync] populateIT error:', err);
		}
		new Notice(`DM Toolkit Sync: ${players.length} joueur(s) importé(s) dans l'Initiative Tracker.`);
	}

	private upsertITCreature(player: CFPlayer) {
		const it = this.getITPlugin();
		if (!it) return;

		const alreadyTracked = this.playerIdToName.has(player.id);
		this.playerIdToName.set(player.id, player.player_name);

		if (alreadyTracked) {
			// Player reconnected — update HP/AC/initiative in place.
			// Never pass `max` to updateCreatureByName (IT treats it as additive).
			// Max HP is only sent via addCreatures (initial join / manual sync).
			this.playerIdToMaxHp.set(player.id, player.max_hp);
			this.applyITUpdate(player.player_name, {
				hp: player.current_hp,
				ac: player.ac,
				initiative: player.initiative ?? undefined,
			});
			return;
		}

		// Truly new player: add to existing encounter.
		this.playerIdToMaxHp.set(player.id, player.max_hp);
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
			console.warn('[DM Toolkit Sync] upsertITCreature error:', err);
		}
	}

	// Documented API: plugin.tracker.updateCreatureByName(name, update)
	// See https://plugins.javalent.com/it/tracker/api
	// Note: `max` is intentionally excluded — IT treats it as additive (+N each call).
	private applyITUpdate(name: string, data: { hp?: number; ac?: number | string; initiative?: number }) {
		const it = this.getITPlugin();
		if (!it) return;
		try {
			if (typeof it.tracker?.updateCreatureByName === 'function') {
				it.tracker.updateCreatureByName(name, data);
			}
		} catch (err) {
			console.warn('[DM Toolkit Sync] applyITUpdate error:', err);
		}
	}

	// ── IT → DM Toolkit pushes ──────────────────────────────────────────────────

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
			new Notice('DM Toolkit Sync: token JWT et ID de session requis.');
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
			new Notice(`DM Toolkit Sync: erreur lors de la récupération des joueurs — ${err}`);
		}
	}

	// ── Settings persistence ────────────────────────────────────────────────────

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DmToolkitSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
