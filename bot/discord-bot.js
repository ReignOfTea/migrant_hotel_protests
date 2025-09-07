import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config/config.js';
import { DeploymentPoller } from './utils/polling.js';
import { DiscordAuditLogger } from './utils/discord-audit.js';
import { EventScheduler } from './utils/scheduler.js';
import { createAboutCommand, handleAboutCommand, handleAboutModal, handleAboutSelect } from './commands/discord/about.js';
import { createAttendCommand, handleAttendCommand, handleAttendModal, handleAttendSelect } from './commands/discord/attend.js';
import { createmoreCommand, handlemoreCommand, handlemoreModal, handlemoreSelect } from './commands/discord/more.js';
import { createLocationsCommand, handleLocationsCommand, handleLocationsModal, handleLocationsSelect } from './commands/discord/locations.js';
import { createEventsCommand, handleEventsCommand, handleEventsModal, handleEventsSelect } from './commands/discord/events.js';
import { createScheduleCommand, handleScheduleCommand, handleScheduleModal, handleScheduleSelect } from './commands/discord/schedule.js';
import { createLiveCommand, handleLiveCommand, handleLiveModal, handleLiveSelect } from './commands/discord/live.js';

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Initialize audit logger, deployment poller, and scheduler
const auditLogger = new DiscordAuditLogger();
const deploymentPoller = new DeploymentPoller(null, auditLogger, client);
const scheduler = new EventScheduler(auditLogger);

// Auth middleware for Discord
function isAuthorized(interaction) {
    const userId = String(interaction.user.id);
    const channelId = interaction.channel?.id;
    const guildId = interaction.guild?.id;

    if (!config.DISCORD_ALLOWED_USERS || config.DISCORD_ALLOWED_USERS.trim() === '') {
        console.warn('DISCORD_ALLOWED_USERS not configured');
        return false;
    }

    const allowedUsers = config.DISCORD_ALLOWED_USERS.split(',').map(id => String(id.trim()));
    const userAuthorized = allowedUsers.includes(userId);

    if (!userAuthorized) {
        return false;
    }

    // Check allowed guilds if configured
    if (config.DISCORD_GUILD_ID && config.DISCORD_GUILD_ID.trim() !== '') {
        const allowedGuilds = config.DISCORD_GUILD_ID.split(',').map(id => String(id.trim()));
        if (!allowedGuilds.includes(guildId)) {
            return false;
        }
    }

    // Check allowed channels if configured
    if (config.DISCORD_ALLOWED_CHANNELS && config.DISCORD_ALLOWED_CHANNELS.trim() !== '') {
        const allowedChannels = config.DISCORD_ALLOWED_CHANNELS.split(',').map(id => String(id.trim()));
        if (!allowedChannels.includes(channelId)) {
            return false;
        }
    }

    return true;
}

// Register slash commands
const commands = [
    createAboutCommand(),
    createAttendCommand(),
    createmoreCommand(),
    createLocationsCommand(),
    createEventsCommand(),
    createScheduleCommand(),
    createLiveCommand(),
    // Add other commands here later
];

client.once('clientReady', async () => {
    console.log(`Discord bot logged in as ${client.user.tag}!`);

    // Start the scheduler
    scheduler.start();

    // Register slash commands using REST API
    try {
        const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

        console.log('Started refreshing application (/) commands.');

        if (config.DISCORD_GUILD_ID && config.DISCORD_GUILD_ID.trim() !== '') {
            const guildIds = config.DISCORD_GUILD_ID.split(',').map(id => id.trim());

            for (const guildId of guildIds) {
                try {
                    await rest.put(
                        Routes.applicationGuildCommands(client.user.id, guildId),
                        { body: commands.map(cmd => cmd.toJSON()) }
                    );
                    console.log(`Successfully registered Discord slash commands for guild ${guildId}`);
                } catch (guildError) {
                    console.error(`Error registering commands for guild ${guildId}:`, guildError);
                }
            }
        } else {
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands.map(cmd => cmd.toJSON()) }
            );
            console.log('Successfully registered Discord slash commands globally');
        }
    } catch (error) {
        console.error('Error registering Discord commands:', error);
    }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Check authorization
    if (!isAuthorized(interaction)) {
        await interaction.reply({
            content: '❌ You are not authorized to use this bot.',
            ephemeral: true
        });
        return;
    }

    // Handle commands
    switch (commandName) {
        case 'about':
            await handleAboutCommand(interaction, deploymentPoller, auditLogger);
            break;
        case 'attend':
            await handleAttendCommand(interaction, deploymentPoller, auditLogger);
            break;
        case 'more':
            await handlemoreCommand(interaction, deploymentPoller, auditLogger);
            break;
        case 'locations':
            await handleLocationsCommand(interaction, deploymentPoller, auditLogger);
            break;
        case 'events':
            await handleEventsCommand(interaction, deploymentPoller, auditLogger);
            break;
        case 'schedule':
            await handleScheduleCommand(interaction, deploymentPoller, auditLogger, scheduler);
            break;
        case 'live':
            await handleLiveCommand(interaction, deploymentPoller, auditLogger);
            break;
    }
});

// Handle modal submissions
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (!isAuthorized(interaction)) {
        await interaction.reply({
            content: '❌ You are not authorized to use this bot.',
            ephemeral: true
        });
        return;
    }

    if (interaction.customId.startsWith('about_')) {
        await handleAboutModal(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('attend_')) {
        await handleAttendModal(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('more_')) {
        await handlemoreModal(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('locations_')) {
        await handleLocationsModal(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('events_')) {
        await handleEventsModal(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('schedule_')) {
        await handleScheduleModal(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('live_')) {
        await handleLiveModal(interaction, deploymentPoller, auditLogger);
    }
});

// Handle select menu interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    if (!isAuthorized(interaction)) {
        await interaction.reply({
            content: '❌ You are not authorized to use this bot.',
            ephemeral: true
        });
        return;
    }

    if (interaction.customId.startsWith('about_')) {
        await handleAboutSelect(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('attend_')) {
        await handleAttendSelect(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('more_')) {
        await handlemoreSelect(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('locations_')) {
        await handleLocationsSelect(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('events_')) {
        await handleEventsSelect(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('schedule_')) {
        await handleScheduleSelect(interaction, deploymentPoller, auditLogger);
    } else if (interaction.customId.startsWith('live_')) {
        await handleLiveSelect(interaction, deploymentPoller, auditLogger);
    }
});

// Error handling
client.on('error', async (error) => {
    console.error('Discord bot error:', error);

    try {
        await auditLogger.logError(
            error,
            'Discord Bot Error',
            null,
            null
        );
    } catch (auditError) {
        console.error('Failed to log Discord error to audit:', auditError);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    scheduler.stop();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    scheduler.stop();
    client.destroy();
    process.exit(0);
});

// Login
client.login(config.DISCORD_TOKEN);
console.log('Discord bot started with scheduler integration!');
