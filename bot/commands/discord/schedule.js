import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const REPEATING_EVENTS_FILE_PATH = 'data/repeating-events.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

// Helper function to truncate text for Discord select menu options
function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Validate time format (HH:MM:SS)
function isValidTime(timeString) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    return timeRegex.test(timeString);
}

export function createScheduleCommand() {
    return new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Manage scheduled events and automation')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new repeating event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a repeating event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable/disable a repeating event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all repeating events'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Manually trigger event cleanup'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('process')
                .setDescription('Manually process repeating events'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View scheduler status'));
}

export async function handleScheduleCommand(interaction, deploymentPoller, auditLogger, scheduler) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'add':
            await handleAddRepeatingEvent(interaction, deploymentPoller, auditLogger);
            break;
        case 'remove':
            await handleRemoveRepeatingEvent(interaction, deploymentPoller, auditLogger);
            break;
        case 'toggle':
            await handleToggleRepeatingEvent(interaction, deploymentPoller, auditLogger);
            break;
        case 'view':
            await handleViewRepeatingEvents(interaction);
            break;
        case 'cleanup':
            await handleManualCleanup(interaction, scheduler, auditLogger);
            break;
        case 'process':
            await handleManualProcess(interaction, scheduler, auditLogger);
            break;
        case 'status':
            await handleSchedulerStatus(interaction, scheduler);
            break;
    }
}

async function handleAddRepeatingEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (locations.length === 0) {
            await interaction.reply({
                content: '❌ No locations available. Please add locations first using `/locations add`.',
                ephemeral: true
            });
            return;
        }

        // Create select menu with available locations
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('schedule_add_location_select')
            .setPlaceholder('Select a location for the repeating event')
            .addOptions(
                locations.map((location, index) => ({
                    label: truncateForSelectMenu(`${location.location} - ${location.venue}`),
                    value: index.toString(),
                    description: truncateForSelectMenu(`ID: ${location.id}`)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**📅 Add Repeating Event**\n\nFirst, select a location for the repeating event:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleAddRepeatingEvent:', error);
        await interaction.reply({
            content: `❌ Error reading locations: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveRepeatingEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (repeatingEvents.length === 0) {
            await interaction.reply({
                content: '❌ No repeating events found.',
                ephemeral: true
            });
            return;
        }

        // Create select menu with existing repeating events
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('schedule_remove_select')
            .setPlaceholder('Select a repeating event to remove')
            .addOptions(
                repeatingEvents.map((event, index) => ({
                    label: truncateForSelectMenu(event.name),
                    value: index.toString(),
                    description: truncateForSelectMenu(`${WEEKDAYS[event.weekday]} at ${event.time}`)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🗑️ Remove Repeating Event**\n\nSelect the repeating event you want to remove:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveRepeatingEvent:', error);
        await interaction.reply({
            content: `❌ Error reading repeating events: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleToggleRepeatingEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (repeatingEvents.length === 0) {
            await interaction.reply({
                content: '❌ No repeating events found.',
                ephemeral: true
            });
            return;
        }

        // Create select menu with existing repeating events
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('schedule_toggle_select')
            .setPlaceholder('Select a repeating event to enable/disable')
            .addOptions(
                repeatingEvents.map((event, index) => {
                    const status = event.enabled ? '✅' : '❌';
                    return {
                        label: truncateForSelectMenu(`${status} ${event.name}`),
                        value: index.toString(),
                        description: truncateForSelectMenu(`${WEEKDAYS[event.weekday]} at ${event.time}`)
                    };
                })
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🔄 Toggle Repeating Event**\n\nSelect the repeating event you want to enable/disable:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleToggleRepeatingEvent:', error);
        await interaction.reply({
            content: `❌ Error reading repeating events: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleViewRepeatingEvents(interaction) {
    try {
        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (repeatingEvents.length === 0) {
            await interaction.reply({
                content: '❌ No repeating events found.',
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📅 Repeating Events')
            .setColor(0x0099FF)
            .setDescription(`Found ${repeatingEvents.length} repeating event(s):`);

        repeatingEvents.forEach((event, index) => {
            const location = locations.find(loc => loc.id === event.locationId);
            const locationName = location ? `${location.location} - ${location.venue}` : `Unknown (${event.locationId})`;
            const status = event.enabled ? '✅ Enabled' : '❌ Disabled';

            embed.addFields({
                name: `${index + 1}. ${event.name}`,
                value: `📍 **Location:** ${locationName}\n📅 **Schedule:** Every ${WEEKDAYS[event.weekday]} at ${event.time}\n🔄 **Status:** ${status}\n🆔 **Location ID:** \`${event.locationId}\``,
                inline: false
            });
        });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleViewRepeatingEvents:', error);
        await interaction.reply({
            content: `❌ Error reading repeating events: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleManualCleanup(interaction, scheduler, auditLogger) {
    if (!scheduler) {
        await interaction.reply({
            content: '❌ Scheduler not available.',
            ephemeral: true
        });
        return;
    }

    try {
        await interaction.reply({
            content: '🧹 **Manual Event Cleanup**\n\nTriggering event cleanup process...',
            ephemeral: true
        });

        await scheduler.triggerCleanup();

        await interaction.editReply({
            content: '✅ **Manual Event Cleanup Complete**\n\nOld events have been processed and removed if necessary.'
        });

    } catch (error) {
        console.error('Error in handleManualCleanup:', error);
        await interaction.editReply({
            content: `❌ Error during manual cleanup: ${error.message}`
        });
    }
}

async function handleManualProcess(interaction, scheduler, auditLogger) {
    if (!scheduler) {
        await interaction.reply({
            content: '❌ Scheduler not available.',
            ephemeral: true
        });
        return;
    }

    try {
        await interaction.reply({
            content: '🔄 **Manual Repeating Events Process**\n\nTriggering repeating events processing...',
            ephemeral: true
        });

        await scheduler.triggerRepeatingEvents();

        await interaction.editReply({
            content: '✅ **Manual Repeating Events Process Complete**\n\nRepeating events have been processed and added if necessary.'
        });

    } catch (error) {
        console.error('Error in handleManualProcess:', error);
        await interaction.editReply({
            content: `❌ Error during manual process: ${error.message}`
        });
    }
}

async function handleSchedulerStatus(interaction, scheduler) {
    if (!scheduler) {
        await interaction.reply({
            content: '❌ Scheduler not available.',
            ephemeral: true
        });
        return;
    }

    try {
        const status = scheduler.getStatus();
        const { config } = await import('../../config/config.js');

        const embed = new EmbedBuilder()
            .setTitle('⏰ Scheduler Status')
            .setColor(status.isRunning ? 0x00FF00 : 0xFF0000)
            .addFields(
                {
                    name: '🔄 Status',
                    value: status.isRunning ? '✅ Running' : '❌ Stopped',
                    inline: true
                },
                {
                    name: '📊 Active Jobs',
                    value: `${status.jobCount} job(s)`,
                    inline: true
                },
                {
                    name: '🗂️ Job Types',
                    value: status.jobs.join(', ') || 'None',
                    inline: true
                },
                {
                    name: '🧹 Cleanup Schedule',
                    value: `Daily at 00:00 GMT\nRemoves events older than ${config.EVENT_CLEANUP_DAYS} days`,
                    inline: false
                },
                {
                    name: '🔄 Repeating Events Schedule',
                    value: `Daily at 00:05 GMT\nAdds events ${config.REPEATING_EVENT_ADVANCE_WEEKS} weeks in advance`,
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleSchedulerStatus:', error);
        await interaction.reply({
            content: `❌ Error getting scheduler status: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle modal submissions
export async function handleScheduleModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('schedule_add_details_')) {
        await handleAddRepeatingEventModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddRepeatingEventModal(interaction, deploymentPoller, auditLogger) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const weekdayValue = interaction.fields.getTextInputValue('weekday').trim();
    const time = interaction.fields.getTextInputValue('time').trim();

    const pendingEvent = interaction.client.pendingRepeatingEvents?.get(interaction.user.id);

    if (!pendingEvent) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            ephemeral: true
        });
        return;
    }

    // Validate weekday
    const weekdayIndex = WEEKDAYS.findIndex(day => day.toLowerCase() === weekdayValue.toLowerCase());
    if (weekdayIndex === -1) {
        await interaction.reply({
            content: `❌ Invalid weekday. Please use one of: ${WEEKDAYS.join(', ')}`,
            ephemeral: true
        });
        return;
    }

    // Validate time format
    if (!isValidTime(time)) {
        await interaction.reply({
            content: '❌ Invalid time format. Please use HH:MM:SS format (e.g., 18:00:00)',
            ephemeral: true
        });
        return;
    }

    try {
        // Add the new repeating event
        const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        const newEvent = {
            name: name,
            locationId: pendingEvent.locationId,
            weekday: weekdayIndex,
            time: time,
            enabled: true,
            created: new Date().toISOString()
        };

        repeatingEvents.push(newEvent);

        const commitSha = await updateFileContent(
            REPEATING_EVENTS_FILE_PATH,
            repeatingEvents,
            sha,
            `Add repeating event: ${name} - ${WEEKDAYS[weekdayIndex]} ${time}`
        );

        await interaction.reply({
            content: `✅ **Repeating Event Added Successfully!**\n\n**Name:** ${name}\n**Location:** ${pendingEvent.locationName}\n**Schedule:** Every ${WEEKDAYS[weekdayIndex]} at ${time}\n**Status:** ✅ Enabled\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.log(
            'Repeating Event Added',
            `Added repeating event "${name}" at ${pendingEvent.locationName} (${pendingEvent.locationId}) - ${WEEKDAYS[weekdayIndex]} ${time}`,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingRepeatingEvents.delete(interaction.user.id);

    } catch (error) {
        console.error('Error adding repeating event:', error);
        await interaction.reply({
            content: `❌ Error adding repeating event: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle select menu interactions
export async function handleScheduleSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'schedule_add_location_select') {
        await handleAddRepeatingEventLocationSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'schedule_remove_select') {
        await handleRemoveRepeatingEventSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'schedule_toggle_select') {
        await handleToggleRepeatingEventSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    }
}

async function handleAddRepeatingEventLocationSelect(interaction, locationIndex, deploymentPoller, auditLogger) {
    try {
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (locationIndex < 0 || locationIndex >= locations.length) {
            await interaction.reply({
                content: '❌ Location not found.',
                ephemeral: true
            });
            return;
        }

        const selectedLocation = locations[locationIndex];
        const locationName = `${selectedLocation.location} - ${selectedLocation.venue}`;

        // Show modal for event details input
        const modal = new ModalBuilder()
            .setCustomId(`schedule_add_details_${Date.now()}`)
            .setTitle(`Add Repeating Event`);

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Event Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Weekly Meetup')
            .setRequired(true)
            .setMaxLength(100);

        const weekdayInput = new TextInputBuilder()
            .setCustomId('weekday')
            .setLabel('Weekday')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Monday, Tuesday, etc.')
            .setRequired(true)
            .setMaxLength(10);

        const timeInput = new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Time (HH:MM:SS)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('18:00:00')
            .setRequired(true)
            .setMaxLength(8);

        const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
        const actionRow2 = new ActionRowBuilder().addComponents(weekdayInput);
        const actionRow3 = new ActionRowBuilder().addComponents(timeInput);

        modal.addComponents(actionRow1, actionRow2, actionRow3);

        await interaction.showModal(modal);

        // Store the location info for when modal is submitted
        interaction.client.pendingRepeatingEvents = interaction.client.pendingRepeatingEvents || new Map();
        interaction.client.pendingRepeatingEvents.set(interaction.user.id, {
            locationId: selectedLocation.id,
            locationName: locationName
        });

    } catch (error) {
        console.error('Error in handleAddRepeatingEventLocationSelect:', error);
        await interaction.reply({
            content: `❌ Error reading location: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveRepeatingEventSelect(interaction, eventIndex, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (eventIndex < 0 || eventIndex >= repeatingEvents.length) {
            await interaction.reply({
                content: '❌ Repeating event not found.',
                ephemeral: true
            });
            return;
        }

        // Remove repeating event
        const removedEvent = repeatingEvents.splice(eventIndex, 1)[0];

        const commitSha = await updateFileContent(
            REPEATING_EVENTS_FILE_PATH,
            repeatingEvents,
            sha,
            `Remove repeating event: ${removedEvent.name}`
        );

        await interaction.reply({
            content: `✅ **Repeating Event Removed Successfully!**\n\n**Name:** ${removedEvent.name}\n**Schedule:** Every ${WEEKDAYS[removedEvent.weekday]} at ${removedEvent.time}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.log(
            'Repeating Event Removed',
            `Removed repeating event "${removedEvent.name}" - ${WEEKDAYS[removedEvent.weekday]} ${removedEvent.time}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing repeating event:', error);
        await interaction.reply({
            content: `❌ Error removing repeating event: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleToggleRepeatingEventSelect(interaction, eventIndex, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (eventIndex < 0 || eventIndex >= repeatingEvents.length) {
            await interaction.reply({
                content: '❌ Repeating event not found.',
                ephemeral: true
            });
            return;
        }

        // Toggle repeating event
        repeatingEvents[eventIndex].enabled = !repeatingEvents[eventIndex].enabled;
        const event = repeatingEvents[eventIndex];
        const status = event.enabled ? 'enabled' : 'disabled';

        const commitSha = await updateFileContent(
            REPEATING_EVENTS_FILE_PATH,
            repeatingEvents,
            sha,
            `${event.enabled ? 'Enable' : 'Disable'} repeating event: ${event.name}`
        );

        await interaction.reply({
            content: `✅ **Repeating Event ${event.enabled ? 'Enabled' : 'Disabled'} Successfully!**\n\n**Name:** ${event.name}\n**Schedule:** Every ${WEEKDAYS[event.weekday]} at ${event.time}\n**Status:** ${event.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.log(
            'Repeating Event Toggled',
            `${event.enabled ? 'Enabled' : 'Disabled'} repeating event "${event.name}" - ${WEEKDAYS[event.weekday]} ${event.time}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error toggling repeating event:', error);
        await interaction.reply({
            content: `❌ Error toggling repeating event: ${error.message}`,
            ephemeral: true
        });
    }
}
