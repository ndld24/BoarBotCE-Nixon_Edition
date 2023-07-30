import fs from 'fs';
import {
	Client, ColorResolvable, EmbedBuilder,
	Events,
	GatewayIntentBits,
	Partials,
	User
} from 'discord.js';
import {Bot} from '../api/bot/Bot';
import {FormatStrings} from '../util/discord/FormatStrings';
import {ConfigHandler} from './handlers/ConfigHandler';
import {CommandHandler} from './handlers/CommandHandler';
import {EventHandler} from './handlers/EventHandler';
import {BotConfig} from './config/BotConfig';
import {Command} from '../api/commands/Command';
import {Subcommand} from '../api/commands/Subcommand';
import {LogDebug} from '../util/logging/LogDebug';
import {PowerupSpawner} from '../util/boar/PowerupSpawner';
import {Queue} from '../util/interactions/Queue';
import {DataHandlers} from '../util/data/DataHandlers';
import {GuildData} from '../util/data/global/GuildData';
import {CronJob} from 'cron';
import {BoarUser} from '../util/boar/BoarUser';
import axios from 'axios';
import {InteractionUtils} from '../util/interactions/InteractionUtils';
import {GitHubData} from '../util/data/global/GitHubData';
import * as crypto from 'crypto';

/**
 * {@link BoarBot BoarBot.ts}
 *
 * Creates a {@link Bot bot}, logs it in, then finds where
 * all event and command handlers are. Loads
 * other configurations as well.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export class BoarBot implements Bot {
	private client: Client = new Client({ intents:[] });
	private configHandler: ConfigHandler = new ConfigHandler;
	private commandHandler: CommandHandler = new CommandHandler();
	private eventHandler: EventHandler = new EventHandler();
	private powSpawner: PowerupSpawner = {} as PowerupSpawner;

	/**
	 * Creates the bot by loading and registering global information
	 */
	public async create(): Promise<void> {
		this.buildClient();

		await this.loadConfig();
		this.registerCommands();
		this.registerListeners();
		this.fixGuildData();
		// this.updateAllData();

		await this.login();
		await this.onStart();
	}

	/**
	 * Builds the {@link Client} object with chosen options
	 */
	public buildClient(): void {
		this.client = new Client({
			partials: [
				Partials.Channel // For notifications
			],
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.DirectMessages
			]
		});
	}

	/**
	 * Returns the client object associated with the bot
	 */
	public getClient(): Client { return this.client; }

	/**
	 * Finds config file and pulls it into the code
	 */
	public async loadConfig(): Promise<void> { await this.configHandler.loadConfig(); }

	/**
	 * Returns config information that was gathered from config file
	 */
	public getConfig(): BotConfig { return this.configHandler.getConfig(); }

	public getConfigHash(): string {
		const configFile = fs.readFileSync('config.json');
		const hashSum = crypto.createHash('sha256');
		hashSum.update(configFile);

		return hashSum.digest('hex');
	}

	/**
	 * Registers command and subcommand information from files
	 */
	public registerCommands(): void { this.commandHandler.registerCommands(); }

	/**
	 * Deploys both application and guild commands
	 */
	public async deployCommands(): Promise<void> { await this.commandHandler.deployCommands(); }

	/**
	 * Returns command information like name, execute function, and more
	 */
	public getCommands(): Map<string, Command> { return this.commandHandler.getCommands(); }

	/**
	 * Returns subcommand information like name and execute function
	 */
	public getSubcommands(): Map<string, Subcommand> { return this.commandHandler.getSubcommands(); }

	/**
	 * Registers event listeners from files
	 */
	public registerListeners(): void { this.eventHandler.registerListeners(); }

	/**
	 * Returns the powerup spawner object
	 */
	public getPowSpawner(): PowerupSpawner { return this.powSpawner; }

	/**
	 * Logs the bot in using token
	 */
	public async login(): Promise<void> {
		try {
			LogDebug.log('Logging in...', this.getConfig());
			await this.client.login(process.env.TOKEN);
		} catch {
			await LogDebug.handleError('Client wasn\'t initialized or you used an invalid token!');
			process.exit(-1);
		}
	}

	/**
	 * Performs actions/functions needed on start
	 */
	public async onStart(): Promise<void> {
		try {
			LogDebug.log('Successfully logged in! Bot online!', this.getConfig());

			fs.readdirSync(this.getConfig().pathConfig.userDataFolder).forEach(async userFile => {
				try {
					await this.getClient().users.fetch(userFile.split('.')[0]);
				} catch {
					LogDebug.handleError('Failed to find user ' + userFile.split('.')[0]);
				}
			});

			this.startNotificationCron();

			const githubData = DataHandlers.getGithubData();
			let configHash = this.getConfigHash();

			setInterval(async () => {
				if (configHash !== this.getConfigHash()) {
					configHash = this.getConfigHash();
					this.loadConfig();
				}

				const config = this.getConfig();
				LogDebug.log('Interaction Listeners: ' + this.client.listenerCount(Events.InteractionCreate), config);
				await this.sendUpdateInfo(githubData);
			}, 180000);

			// Powerup spawning

			let timeUntilPow = 0;

			await Queue.addQueue(async () => {
				try {
					const globalData = DataHandlers.getGlobalData();
					timeUntilPow = globalData.nextPowerup;
				} catch (err: unknown) {
					await LogDebug.handleError(err);
				}
			}, 'start' + 'global').catch((err) => { throw err });

			this.powSpawner = new PowerupSpawner(timeUntilPow);
			this.powSpawner.startSpawning();

			LogDebug.log('All functions online!', this.getConfig(), undefined, true);
		} catch (err: unknown) {
			await LogDebug.handleError(err);
		}
	}

	/**
	 * Starts CronJob that sends notifications for boar daily
	 * @private
	 */
	private startNotificationCron(): void {
		new CronJob('0 0 * * *', async () => {
			fs.readdirSync(this.getConfig().pathConfig.userDataFolder).forEach(async userFile => {
				const user: User | undefined = this.getClient().users.cache.get(userFile.split('.')[0]);

				if (!user) return;

				const boarUser = new BoarUser(user);

				if (boarUser.stats.general.notificationsOn) {
					const msgStrs = this.getConfig().stringConfig.notificationExtras;
					const dailyReadyStr = this.getConfig().stringConfig.notificationDailyReady;
					const stopStr = this.getConfig().stringConfig.notificationStopStr;

					const randMsgIndex = Math.floor(Math.random() * msgStrs.length);
					let randMsgStr = msgStrs[randMsgIndex];

					if (randMsgStr !== '') {
						randMsgStr = '## ' + randMsgStr + '\n';
					}

					switch (randMsgIndex) {
						case 5:
							randMsgStr = randMsgStr.replace(
								'%@', Object.keys(this.getConfig().itemConfigs.boars).length.toLocaleString()
							);
							break;
						case 7:
							randMsgStr = randMsgStr.replace(
								'%@', fs.readdirSync(this.getConfig().pathConfig.userDataFolder).length.toLocaleString()
							);
							break;
						case 16:
							randMsgStr = randMsgStr.replace(
								'%@',
								fs.readdirSync(this.getConfig().pathConfig.guildDataFolder).length.toLocaleString()
							);
							break;
						case 17:
							randMsgStr = randMsgStr.replace('%@', boarUser.stats.general.boarStreak.toLocaleString());
							break;
					}

					const notificationChannelID = boarUser.stats.general.notificationChannel
						? boarUser.stats.general.notificationChannel
						: '1124209789518483566';
					await user.send(
						randMsgStr + dailyReadyStr + '\n# ' +
						FormatStrings.toBasicChannel(notificationChannelID) + stopStr
					).catch(() => {});
				}
			});
		}, null, true, 'UTC');
	}

	private async sendUpdateInfo(githubData: GitHubData | undefined): Promise<void> {
		const config = this.getConfig();

		try {
			if (!githubData) return;

			const commit = await axios.get(config.stringConfig.commitLink, {
				headers: { Authorization: 'Token ' + process.env.GITHUB_TOKEN as string }
			});
			const commitData = commit.data;

			if (commitData.sha !== githubData.lastCommitSha) {
				githubData.lastCommitSha = commitData.sha;
				fs.writeFileSync(
					config.pathConfig.globalDataFolder + config.pathConfig.githubFileName,
					JSON.stringify(githubData)
				);

				const commitMsg = commitData.commit.message;
				const commitName = commitMsg.substring(0, commitMsg.indexOf('\n'));
				const commitChannel = await InteractionUtils.getTextChannel(config.logChannel);
				const commitEmbed = new EmbedBuilder()
					.setColor(config.colorConfig.dark as ColorResolvable)
					.setTitle(commitName)
					.setURL(commitData.html_url)
					.setDescription(commitMsg.replace(commitName, ''))
					.setThumbnail(config.stringConfig.githubImg);

				commitChannel?.send({ embeds: [commitEmbed] });
			}
		} catch {
			LogDebug.log('Failed to get latest GitHub commit', config);
		}
	}

	/**
	 * Deletes empty guild files (Guild was in the process of setting bot up)
	 *
	 * @private
	 */
	private fixGuildData(): void {
		let guildDataFolder: string;
		let guildDataFiles: string[];

		try {
			guildDataFolder = this.getConfig().pathConfig.guildDataFolder;
			guildDataFiles = fs.readdirSync(guildDataFolder);
		} catch {
			LogDebug.handleError('Unable to find guild data directory provided in \'config.json\'!');
			process.exit(-1);
		}

		for (const guildFile of guildDataFiles) {
			const guildData: GuildData = JSON.parse(fs.readFileSync(guildDataFolder + guildFile, 'utf-8')) as GuildData;
			if (guildData.fullySetup) continue;

			fs.rmSync(guildDataFolder + guildFile);

			LogDebug.log('Deleted unfinished guild file: ' + guildFile, this.getConfig());
		}

		LogDebug.log('Guild data fixed!', this.getConfig())
	}
}
