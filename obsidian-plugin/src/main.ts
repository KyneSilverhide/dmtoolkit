import { FuzzySuggestModal, Notice, Plugin } from 'obsidian';
import { io, Socket } from 'socket.io-client';
import { DmToolkitSettings, DmToolkitSettingTab, DEFAULT_SETTINGS } from './settings';

interface AudioTrack {
	id: number;
	original_name: string;
	audio_category: string | null;
	url: string;
}

interface DMTSession {
	id: number;
	code: string;
	name: string;
	is_open?: boolean;
}

class SessionPickerModal extends FuzzySuggestModal<DMTSession> {
	private sessions: DMTSession[];
	private onChoose: (session: DMTSession) => void;

	constructor(app: import('obsidian').App, sessions: DMTSession[], onChoose: (s: DMTSession) => void) {
		super(app);
		this.sessions = sessions;
		this.onChoose = onChoose;
		this.setPlaceholder('Choisir une session…');
	}

	getItems(): DMTSession[] { return this.sessions; }

	getItemText(s: DMTSession): string {
		return `[${s.code}] ${s.name}`;
	}

	onChooseItem(s: DMTSession): void {
		this.onChoose(s);
	}
}

class AudioTrackModal extends FuzzySuggestModal<AudioTrack> {
	private tracks: AudioTrack[];
	private onChoose: (track: AudioTrack) => void;

	constructor(app: import('obsidian').App, tracks: AudioTrack[], onChoose: (track: AudioTrack) => void) {
		super(app);
		this.tracks = tracks;
		this.onChoose = onChoose;
		this.setPlaceholder('Rechercher une piste audio…');
	}

	getItems(): AudioTrack[] { return this.tracks; }

	getItemText(track: AudioTrack): string {
		const cat = track.audio_category || 'Général';
		return `[${cat}] ${track.original_name || track.url}`;
	}

	onChooseItem(track: AudioTrack): void { this.onChoose(track); }
}

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
	private jwtToken: string | null = null;
	// plugin.api  → addCreatures / newEncounter
	// plugin.tracker → updateCreatureByName
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private itPlugin: any = null;
	/** id → player_name, used to map socket events to IT creature names */
	private readonly playerIdToName = new Map<number, string>();
	/** id → max_hp, tracked locally to avoid IT's additive max bug */
	private readonly playerIdToMaxHp = new Map<number, number>();
	/** Last IT round value seen — used to detect changes */
	private lastKnownRound = 0;
	private itRoundUnsubscribe: (() => void) | null = null;
	/** True after the first populateIT call — reconnects update in place instead of re-adding */

	async onload() {
		await this.loadSettings();
		console.log('[DM Toolkit Sync] Plugin chargé (round sync v2)');
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

		this.addCommand({
			id: 'insert-audio-link',
			name: 'Insérer un lien audio DM Toolkit',
			editorCallback: async (editor) => {
				const { backendUrl, sessionId } = this.settings;
				if (!this.jwtToken) {
					new Notice('DM Toolkit Sync: non connecté. Lance la connexion d\'abord.');
					return;
				}
				if (!sessionId) {
					new Notice('DM Toolkit Sync: configure l\'ID de session d\'abord.');
					return;
				}
				try {
					const res = await fetch(
						`${backendUrl}/api/sessions/${sessionId}/images?type=audio`,
						{ headers: { Authorization: `Bearer ${this.jwtToken}` } }
					);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const tracks = await res.json() as AudioTrack[];
					if (!tracks.length) {
						new Notice('DM Toolkit Sync: aucune piste audio dans cette session.');
						return;
					}
					new AudioTrackModal(this.app, tracks, (track) => {
						const name = track.original_name || track.url;
						editor.replaceSelection(`[${name}](dmt-audio://${track.id})`);
					}).open();
				} catch (err) {
					new Notice(`DM Toolkit Sync: impossible de charger les pistes — ${err}`);
				}
			},
		});

		this.registerMarkdownPostProcessor((el) => {
			el.querySelectorAll<HTMLAnchorElement>('a[href^="dmt-audio://"]').forEach(a => {
				const trackId = parseInt(a.getAttribute('href')!.replace('dmt-audio://', ''), 10);
				if (!Number.isFinite(trackId) || trackId <= 0) return;
				const label = a.textContent || 'Piste audio';

				const container = document.createElement('span');
				container.className = 'dmt-audio-player';
				container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:2px 6px;font-size:0.85em;vertical-align:middle;';

				const playBtn = document.createElement('button');
				playBtn.className = 'dmt-audio-btn';
				playBtn.textContent = `▶ ${label}`;
				playBtn.title = 'Lecture';
				playBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-accent);padding:0 4px;font-size:inherit;';
				playBtn.addEventListener('click', () => this.controlAudio('play', trackId));

				const stopBtn = document.createElement('button');
				stopBtn.textContent = '⏹';
				stopBtn.title = 'Arrêter';
				stopBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0 4px;font-size:1.1em;opacity:0.7;line-height:1;';
				stopBtn.addEventListener('click', () => this.controlAudio('stop', trackId));

				let loopActive = false;
				const loopBtn = document.createElement('button');
				loopBtn.textContent = '🔁';
				loopBtn.title = 'Boucle';
				loopBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0 2px;font-size:inherit;opacity:0.35;transition:opacity 0.15s;';
				loopBtn.addEventListener('click', () => {
					loopActive = !loopActive;
					loopBtn.style.opacity = loopActive ? '1' : '0.35';
					this.controlAudio('loop', trackId, { loop: loopActive });
				});

				const volSlider = document.createElement('input');
				volSlider.type = 'range';
				volSlider.min = '0';
				volSlider.max = '1';
				volSlider.step = '0.05';
				volSlider.value = '1';
				volSlider.title = 'Volume';
				volSlider.style.cssText = 'width:60px;cursor:pointer;accent-color:var(--text-accent);vertical-align:middle;';
				let volTimer: ReturnType<typeof setTimeout> | null = null;
				const sendVolume = () => this.controlAudio('volume', trackId, { volume: parseFloat(volSlider.value) });
				volSlider.addEventListener('input', () => {
					if (volTimer) clearTimeout(volTimer);
					volTimer = setTimeout(() => { sendVolume(); volTimer = null; }, 150);
				});
				volSlider.addEventListener('change', () => {
					if (volTimer) { clearTimeout(volTimer); volTimer = null; }
					sendVolume();
				});

				container.appendChild(playBtn);
				container.appendChild(stopBtn);
				container.appendChild(loopBtn);
				container.appendChild(volSlider);
				a.replaceWith(container);
			});
		});

		// Click on a rendered ![[image.jpg]] or Meta Bind imageSuggester → show on TV
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if (!this.socket?.connected || !this.settings.sessionId) return;
			const target = evt.target as HTMLElement;

			// Case 1: standard ![[image.jpg]] embed
			const embed = target.closest('.internal-embed.image-embed') as HTMLElement | null;
			if (embed) {
				const src = embed.getAttribute('src');
				if (src) this.sendImageToTV(src.split('/').pop() ?? src);
				return;
			}

			// Case 2: Meta Bind imageSuggester — img.mb-image-card-image
			// alt = vault-relative path, e.g. "Images/Frere Halven Draak.png"
			const img = (target.tagName === 'IMG' ? target : target.closest('img')) as HTMLImageElement | null;
			if (img?.classList.contains('mb-image-card-image')) {
				const filename = (img.alt || '').split('/').pop() ?? '';
				if (filename) this.sendImageToTV(filename);
			}
		});

		if (this.settings.autoSync && this.settings.username && this.settings.password && this.settings.sessionId) {
			this.app.workspace.onLayoutReady(() => this.connect({ skipPicker: true }));
		}
	}

	onunload() {
		this.disconnect();
	}

	// ── Auth ────────────────────────────────────────────────────────────────────

	private async login(): Promise<boolean> {
		const { backendUrl, username, password } = this.settings;
		if (!username || !password) {
			new Notice('DM Toolkit Sync: configure le nom d\'utilisateur et le mot de passe d\'abord.');
			return false;
		}
		try {
			const res = await fetch(`${backendUrl}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({})) as { error?: string };
				new Notice(`DM Toolkit Sync: connexion échouée — ${data.error ?? res.status}`);
				return false;
			}
			const { token } = await res.json() as { token: string };
			this.jwtToken = token;
			return true;
		} catch (err) {
			new Notice(`DM Toolkit Sync: impossible de contacter le serveur — ${err}`);
			return false;
		}
	}

	// ── Connection ──────────────────────────────────────────────────────────────

	async connect({ skipPicker = false } = {}) {
		console.log('[DM Toolkit Sync] connect() appelé');
		if (this.socket?.connected) {
			new Notice('DM Toolkit Sync: déjà connecté.');
			return;
		}

		if (!this.settings.username || !this.settings.password) {
			new Notice('DM Toolkit Sync: configure le nom d\'utilisateur et le mot de passe d\'abord.');
			return;
		}

		const loggedIn = await this.login();
		console.log('[DM Toolkit Sync] login:', loggedIn);
		if (!loggedIn) return;

		if (!skipPicker || !this.settings.sessionId) {
			const chosenId = await this.fetchAndPickSession();
			console.log('[DM Toolkit Sync] session choisie:', chosenId);
			if (!chosenId) return;
			this.settings.sessionId = chosenId;
			await this.saveSettings();
		}

		const { backendUrl, sessionId } = this.settings;
		console.log('[DM Toolkit Sync] io() vers', backendUrl, 'session', sessionId);

		this.socket = io(backendUrl, {
			auth: { token: this.jwtToken },
			reconnection: true,
		});

		this.socket.on('connect', () => {
			console.log('[DM Toolkit Sync] socket connecté, démarrage round sync');
			new Notice('DM Toolkit Sync: connecté ✓');
			this.socket!.emit('admin-join', sessionId);
			this.startRoundSync();
		});

		this.socket.on('connect_error', (err: Error) => {
			new Notice(`DM Toolkit Sync: erreur de connexion — ${err.message}`);
		});

		this.socket.on('disconnect', () => {
			new Notice('DM Toolkit Sync: déconnecté.');
			this.stopRoundSync();
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

		this.socket.on('obsidian-audio-error', ({ message }: { message: string }) => {
			new Notice(`DM Toolkit Audio : ${message}`);
		});

		this.socket.on('obsidian-image-error', ({ message }: { message: string }) => {
			new Notice(`DM Toolkit Image : ${message}`);
		});

		this.socket.on('obsidian-image-shown', ({ imageName }: { imageName: string }) => {
			new Notice(`Sur TV : ${imageName}`);
		});
	}

	private async fetchAndPickSession(): Promise<number | null> {
		try {
			const res = await fetch(`${this.settings.backendUrl}/api/sessions`, {
				headers: { Authorization: `Bearer ${this.jwtToken}` },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const sessions = await res.json() as DMTSession[];
			if (!sessions.length) {
				new Notice('DM Toolkit Sync: aucune session trouvée sur ce compte.');
				return null;
			}
			if (sessions.length === 1) return sessions[0].id;
			return new Promise(resolve => {
				new SessionPickerModal(
					this.app, sessions,
					(s) => resolve(s.id),
				).open();
			});
		} catch (err) {
			new Notice(`DM Toolkit Sync: impossible de charger les sessions — ${err}`);
			return null;
		}
	}

	private sendImageToTV(filename: string) {
		if (!this.socket?.connected || !this.settings.sessionId) return;
		this.socket.emit('obsidian-show-image', {
			sessionId: this.settings.sessionId,
			imageName: filename,
		});
	}

	private controlAudio(action: 'play' | 'stop' | 'loop' | 'volume', trackId: number, params?: { loop?: boolean; volume?: number }) {
		if (!this.socket?.connected || !this.settings.sessionId) {
			new Notice('DM Toolkit Sync: non connecté. Lance la connexion d\'abord.');
			return;
		}
		const sessionId = this.settings.sessionId;
		switch (action) {
			case 'play':
				this.socket.emit('obsidian-play-audio', { sessionId, trackId });
				break;
			case 'stop':
				this.socket.emit('obsidian-stop-audio', { sessionId, trackId });
				break;
			case 'loop':
				this.socket.emit('obsidian-loop-audio', { sessionId, trackId, loop: params?.loop ?? false });
				break;
			case 'volume':
				this.socket.emit('obsidian-volume-audio', { sessionId, trackId, volume: params?.volume ?? 1 });
				break;
		}
	}

	disconnect() {
		this.stopRoundSync();
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
		this.jwtToken = null;
	}

	// ── IT helpers ──────────────────────────────────────────────────────────────

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private getITPlugin(): any {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (this.app as any).plugins?.plugins;
		return plugins?.['initiative-tracker'] ?? null;
	}

	/** Sync players into IT — idempotent: updates in place if name already exists, adds otherwise. Never calls newEncounter(). */
	private populateIT(players: CFPlayer[]) {
		const it = this.getITPlugin();
		if (!it) {
			new Notice('DM Toolkit Sync: Initiative Tracker introuvable. Installe et active le plugin.');
			return;
		}
		this.playerIdToName.clear();
		this.playerIdToMaxHp.clear();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const existingNames = new Set<string>(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(it.tracker?.getOrderedCreatures?.() ?? []).map((c: any) => c.name as string)
		);

		const toAdd: object[] = [];
		for (const p of players) {
			this.playerIdToName.set(p.id, p.player_name);
			this.playerIdToMaxHp.set(p.id, p.max_hp);
			if (existingNames.has(p.player_name)) {
				this.applyITUpdate(p.player_name, {
					hp: p.current_hp,
					ac: p.ac,
					initiative: p.initiative ?? undefined,
				});
			} else {
				toAdd.push({
					name: p.player_name,
					hp: p.current_hp,
					max: p.max_hp,
					ac: p.ac,
					initiative: p.initiative ?? undefined,
					player: true,
				});
			}
		}

		try {
			if (toAdd.length > 0 && typeof it.api?.addCreatures === 'function') {
				it.api.addCreatures(toAdd);
			}
		} catch (err) {
			console.error('[DM Toolkit Sync] populateIT error:', err);
		}
		new Notice(`DM Toolkit Sync: ${players.length} joueur(s) synchronisé(s) dans l'Initiative Tracker.`);
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

	private pushRoundToCF(round: number) {
		if (!this.socket?.connected || !this.settings.sessionId) return;
		this.socket.emit('set-combat-round', {
			sessionId: this.settings.sessionId,
			round,
		});
	}

	private startRoundSync() {
		this.stopRoundSync();
		const it = this.getITPlugin();
		const roundStore = it?.tracker?.round;
		if (typeof roundStore?.subscribe !== 'function') {
			console.warn('[DM Toolkit Sync] round store introuvable sur it.tracker.round');
			return;
		}
		console.log('[DM Toolkit Sync] Abonnement au store round IT');

		let isFirst = true;
		this.itRoundUnsubscribe = roundStore.subscribe((round: number) => {
			if (isFirst) {
				isFirst = false;
				this.lastKnownRound = round ?? 0;
				console.log('[DM Toolkit Sync] Valeur initiale du round IT :', this.lastKnownRound, '(non envoyée)');
				return;
			}
			const r = round ?? 0;
			console.log('[DM Toolkit Sync] Round IT changé :', this.lastKnownRound, '→', r);
			if (r !== this.lastKnownRound) {
				this.lastKnownRound = r;
				if (r > 0) {
					console.log('[DM Toolkit Sync] → Push set-combat-round', r);
					this.pushRoundToCF(r);
				} else {
					console.log('[DM Toolkit Sync] → Round 0, non envoyé');
				}
			}
		});
	}

	private stopRoundSync() {
		if (this.itRoundUnsubscribe) {
			this.itRoundUnsubscribe();
			this.itRoundUnsubscribe = null;
		}
	}

	// ── Manual sync via REST ────────────────────────────────────────────────────

	async syncPlayersFromCF() {
		if (!this.jwtToken) {
			new Notice('DM Toolkit Sync: non connecté. Lance la connexion d\'abord.');
			return;
		}
		const { backendUrl, sessionId } = this.settings;
		if (!sessionId) {
			new Notice('DM Toolkit Sync: ID de session requis.');
			return;
		}
		try {
			const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/players`, {
				headers: { Authorization: `Bearer ${this.jwtToken}` },
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
