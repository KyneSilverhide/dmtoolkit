import { App, PluginSettingTab, Setting } from 'obsidian';
import DmToolkitSync from './main';

export interface DmToolkitSettings {
	backendUrl: string;
	username: string;
	password: string;
	sessionId: number;
	autoSync: boolean;
}

export const DEFAULT_SETTINGS: DmToolkitSettings = {
	backendUrl: 'http://localhost:3000',
	username: '',
	password: '',
	sessionId: 0,
	autoSync: true,
};

export class DmToolkitSettingTab extends PluginSettingTab {
	plugin: DmToolkitSync;

	constructor(app: App, plugin: DmToolkitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('URL du backend DM Toolkit')
			.setDesc('Ex : http://localhost:3000 ou https://monserveur.example.com')
			.addText(text => text
				.setPlaceholder('http://localhost:3000')
				.setValue(this.plugin.settings.backendUrl)
				.onChange(async (value) => {
					this.plugin.settings.backendUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Nom d\'utilisateur')
			.setDesc('Identifiant du compte admin DM Toolkit.')
			.addText(text => text
				.setPlaceholder('admin')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mot de passe')
			.setDesc('Mot de passe du compte admin DM Toolkit.')
			.addText(text => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('••••••••')
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('ID de session')
			.setDesc('Rempli automatiquement lors de la connexion. Peut être forcé manuellement si nécessaire.')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(this.plugin.settings.sessionId || ''))
				.onChange(async (value) => {
					this.plugin.settings.sessionId = parseInt(value, 10) || 0;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Connexion automatique au démarrage')
			.setDesc('Se connecter automatiquement à l\'ouverture d\'Obsidian si les identifiants sont configurés.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Connexion manuelle')
			.setDesc('Connecte ou déconnecte le plugin manuellement.')
			.addButton(btn => btn
				.setButtonText('Connecter')
				.setCta()
				.onClick(() => this.plugin.connect()))
			.addButton(btn => btn
				.setButtonText('Déconnecter')
				.onClick(() => this.plugin.disconnect()));

		new Setting(containerEl)
			.setName('Import joueurs')
			.setDesc('Récupère les joueurs via REST et les injecte dans l\'Initiative Tracker.')
			.addButton(btn => btn
				.setButtonText('Importer maintenant')
				.onClick(() => this.plugin.syncPlayersFromCF()));
	}
}
