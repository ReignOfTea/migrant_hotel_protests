import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const REPEATING_EVENTS_FILE_PATH = 'data/repeating-events.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';
const MAX_SELECT_OPTIONS = 25;

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

// Helper function to truncate text for Discord select menu options
function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Helper function to chunk array into pages
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
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
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort locations alphabetically for better UX
        const sortedLocations = locations
            .map((location, originalIndex) => ({ ...location, originalIndex }))
            .sort((a, b) => a.location.localeCompare(b.location));

        await showLocationSelectPage(interaction, sortedLocations, 0, 'add');

    } catch (error) {
        console.error('Error in handleAddRepeatingEvent:', error);
        await interaction.reply({
            content: `❌ Error reading locations: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRemoveRepeatingEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (repeatingEvents.length === 0) {
            await interaction.reply({
                content: '❌ No repeating events found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort events by name for better UX
        const sortedEvents = repeatingEvents
            .map((event, originalIndex) => ({ ...event, originalIndex }))
            .sort((a, b) => a.name.localeCompare(b.name));

        await showRepeatingEventSelectPage(interaction, sortedEvents, 0, 'remove');

    } catch (error) {
        console.error('Error in handleRemoveRepeatingEvent:', error);
        await interaction.reply({
            content: `❌ Error reading repeating events: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleToggleRepeatingEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (repeatingEvents.length === 0) {
            await interaction.reply({
                content: '❌ No repeating events found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort events by name for better UX
        const sortedEvents = repeatingEvents
            .map((event, originalIndex) => ({ ...event, originalIndex }))
            .sort((a, b) => a.name.localeCompare(b.name));

        await showRepeatingEventSelectPage(interaction, sortedEvents, 0, 'toggle');

    } catch (error) {
        console.error('Error in handleToggleRepeatingEvent:', error);
        await interaction.reply({
            content: `❌ Error reading repeating events: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showLocationSelectPage(interaction, sortedLocations, page, action) {
    const chunks = chunkArray(sortedLocations, MAX_SELECT_OPTIONS);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    if (!currentChunk || currentChunk.length === 0) {
        await interaction.reply({
            content: '❌ No locations found on this page.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Create select menu with current page locations
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('schedule_add_location_select')
        .setPlaceholder(`Select a location (Page ${page + 1}/${totalPages})`)
        .addOptions(
            currentChunk.map((location) => ({
                label: truncateForSelectMenu(`${location.location} - ${location.venue}`),
                value: location.originalIndex.toString(),
                description: truncateForSelectMenu(`ID: ${location.id}`)
            }))
        );

    const components = [new ActionRowBuilder().addComponents(selectMenu)];

    // Add navigation buttons if needed
    if (totalPages > 1) {
        const navigationRow = new ActionRowBuilder();

        if (page > 0) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_add_location_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_add_location_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const content = `**📅 Add Repeating Event**\n\nSelect a location for the repeating event (Page ${page + 1} of ${totalPages}):`;

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content,
            components,
            embeds: []
        });
    } else {
        await interaction.reply({
            content,
            components,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showRepeatingEventSelectPage(interaction, sortedEvents, page, action) {
    const chunks = chunkArray(sortedEvents, MAX_SELECT_OPTIONS);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    if (!currentChunk || currentChunk.length === 0) {
        await interaction.reply({
            content: '❌ No repeating events found on this page.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Create select menu with current page events
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`schedule_${action}_select`)
        .setPlaceholder(`Select a repeating event to ${action} (Page ${page + 1}/${totalPages})`)
        .addOptions(
            currentChunk.map((event) => {
                const status = action === 'toggle' ? (event.enabled ? '✅' : '❌') : '';
                return {
                    label: truncateForSelectMenu(`${status} ${event.name}`),
                    value: event.originalIndex.toString(),
                    description: truncateForSelectMenu(`${WEEKDAYS[event.weekday]} at ${event.time}`)
                };
            })
        );

    const components = [new ActionRowBuilder().addComponents(selectMenu)];

    // Add navigation buttons if needed
    if (totalPages > 1) {
        const navigationRow = new ActionRowBuilder();

        if (page > 0) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_${action}_event_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_${action}_event_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const actionText = action === 'remove' ? 'Remove Repeating Event' : 'Toggle Repeating Event';
    const content = `**🔄 ${actionText}**\n\nSelect the repeating event you want to ${action} (Page ${page + 1} of ${totalPages}):`;

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content,
            components,
            embeds: []
        });
    } else {
        await interaction.reply({
            content,
            components,
            flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort events by name for better display
        const sortedEvents = repeatingEvents.sort((a, b) => a.name.localeCompare(b.name));

        // Discord embed limit is 25 fields, so we need to paginate
        const EVENTS_PER_PAGE = 25;
        const totalPages = Math.ceil(sortedEvents.length / EVENTS_PER_PAGE);
        const currentPage = 0; // Start with first page

        await showRepeatingEventsPage(interaction, sortedEvents, locations, currentPage, totalPages);

    } catch (error) {
        console.error('Error in handleViewRepeatingEvents:', error);
        await interaction.reply({
            content: `❌ Error reading repeating events: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showRepeatingEventsPage(interaction, sortedEvents, locations, page, totalPages) {
    const EVENTS_PER_PAGE = 25;
    const startIndex = page * EVENTS_PER_PAGE;
    const endIndex = Math.min(startIndex + EVENTS_PER_PAGE, sortedEvents.length);
    const pageEvents = sortedEvents.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle('📅 Repeating Events')
        .setColor(0x0099FF)
        .setDescription(`Showing events ${startIndex + 1}-${endIndex} of ${sortedEvents.length} (Page ${page + 1} of ${totalPages})`);

    pageEvents.forEach((event, index) => {
        const location = locations.find(loc => loc.id === event.locationId);
        const locationName = location ? `${location.location} - ${location.venue}` : `Unknown (${event.locationId})`;
        const status = event.enabled ? '✅ Enabled' : '❌ Disabled';

        embed.addFields({
            name: `${startIndex + index + 1}. ${event.name}`,
            value: `📍 **Location:** ${locationName}\n📅 **Schedule:** Every ${WEEKDAYS[event.weekday]} at ${event.time}\n🔄 **Status:** ${status}\n🆔 **Location ID:** \`${event.locationId}\``,
            inline: false
        });
    });

    const components = [];

    // Add navigation buttons if there are multiple pages
    if (totalPages > 1) {
        const navigationRow = new ActionRowBuilder();

        if (page > 0) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_view_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_view_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            embeds: [embed],
            components,
            content: null
        });
    } else {
        await interaction.reply({
            embeds: [embed],
            components,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Add this to handle the view pagination buttons
async function handleViewRepeatingEventsPagination(interaction, customId) {
    try {
        console.log('Handling view pagination:', customId);
        const page = parseInt(customId.split('_').pop());

        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        const sortedEvents = repeatingEvents.sort((a, b) => a.name.localeCompare(b.name));
        const totalPages = Math.ceil(sortedEvents.length / 25);

        await showRepeatingEventsPage(interaction, sortedEvents, locations, page, totalPages);
    } catch (error) {
        console.error('Error in handleViewRepeatingEventsPagination:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Error loading page: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

async function handleManualCleanup(interaction, scheduler, auditLogger) {
    if (!scheduler) {
        await interaction.reply({
            content: '❌ Scheduler not available.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        await interaction.reply({
            content: '🧹 **Manual Event Cleanup**\n\nTriggering event cleanup process...',
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        await interaction.reply({
            content: '🔄 **Manual Repeating Events Process**\n\nTriggering repeating events processing...',
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('Error in handleSchedulerStatus:', error);
        await interaction.reply({
            content: `❌ Error getting scheduler status: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle button interactions for pagination
export async function handleScheduleButton(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    console.log('Schedule button interaction received:', customId);

    try {
        if (customId.includes('_location_prev_') || customId.includes('_location_next_')) {
            await handleLocationPagination(interaction, customId);
        } else if (customId.includes('_event_prev_') || customId.includes('_event_next_')) {
            await handleEventPagination(interaction, customId);
        } else if (customId.includes('_view_prev_') || customId.includes('_view_next_')) {
            await handleViewRepeatingEventsPagination(interaction, customId);
        } else {
            console.log('Unknown schedule button customId:', customId);
            await interaction.reply({
                content: '❌ Unknown button interaction.',
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        console.error('Error in handleScheduleButton:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Error handling button: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

async function handleLocationPagination(interaction, customId) {
    try {
        console.log('Handling location pagination:', customId);
        const page = parseInt(customId.split('_').pop());

        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);
        const sortedLocations = locations
            .map((location, originalIndex) => ({ ...location, originalIndex }))
            .sort((a, b) => a.location.localeCompare(b.location));

        await showLocationSelectPage(interaction, sortedLocations, page, 'add');
    } catch (error) {
        console.error('Error in handleLocationPagination:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Error loading page: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

async function handleEventPagination(interaction, customId) {
    try {
        console.log('Handling event pagination:', customId);
        const page = parseInt(customId.split('_').pop());
        const action = customId.includes('_remove_') ? 'remove' : 'toggle';

        const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
        const sortedEvents = repeatingEvents
            .map((event, originalIndex) => ({ ...event, originalIndex }))
            .sort((a, b) => a.name.localeCompare(b.name));

        await showRepeatingEventSelectPage(interaction, sortedEvents, page, action);
    } catch (error) {
        console.error('Error in handleEventPagination:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Error loading page: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
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
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Validate weekday
    const weekdayIndex = WEEKDAYS.findIndex(day => day.toLowerCase() === weekdayValue.toLowerCase());
    if (weekdayIndex === -1) {
        await interaction.reply({
            content: `❌ Invalid weekday. Please use one of: ${WEEKDAYS.join(', ')}`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Validate time format
    if (!isValidTime(time)) {
        await interaction.reply({
            content: '❌ Invalid time format. Please use HH:MM:SS format (e.g., 18:00:00)',
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRemoveRepeatingEventSelect(interaction, eventIndex, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (eventIndex < 0 || eventIndex >= repeatingEvents.length) {
            await interaction.reply({
                content: '❌ Repeating event not found.',
                flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleToggleRepeatingEventSelect(interaction, eventIndex, deploymentPoller, auditLogger) {
    try {
        const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

        if (eventIndex < 0 || eventIndex >= repeatingEvents.length) {
            await interaction.reply({
                content: '❌ Repeating event not found.',
                flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
    }
}
