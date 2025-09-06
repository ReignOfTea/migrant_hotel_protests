import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const EVENTS_FILE_PATH = 'data/times.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';
const MAX_SELECT_OPTIONS = 25;

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

// Validate datetime format (ISO 8601)
function isValidDateTime(dateTimeString) {
    try {
        // Check basic format first
        if (!dateTimeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
            return false;
        }

        const date = new Date(dateTimeString);

        // Check if it's a valid date
        if (isNaN(date.getTime())) {
            return false;
        }

        // Check if the parsed date matches the input (catches invalid dates like Feb 30)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');

        const reconstructed = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

        return reconstructed === dateTimeString;
    } catch (_) {
        return false;
    }
}

// Format datetime for display
function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function createEventsCommand() {
    return new SlashCommandBuilder()
        .setName('events')
        .setDescription('Manage events')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all events'));
}

export async function handleEventsCommand(interaction, deploymentPoller, auditLogger) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'add':
            await handleAddEvent(interaction, deploymentPoller, auditLogger);
            break;
        case 'remove':
            await handleRemoveEvent(interaction, deploymentPoller, auditLogger);
            break;
        case 'view':
            await handleViewEvents(interaction);
            break;
    }
}

async function handleAddEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (locations.length === 0) {
            await interaction.reply({
                content: '❌ No locations available. Please add locations first using `/locations add`.',
                ephemeral: true
            });
            return;
        }

        await showLocationSelectPage(interaction, locations, 0, 'add');

    } catch (error) {
        console.error('Error in handleAddEvent:', error);
        await interaction.reply({
            content: `❌ Error reading locations: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveEvent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: events } = await getFileContent(EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (events.length === 0) {
            await interaction.reply({
                content: '❌ No events found.',
                ephemeral: true
            });
            return;
        }

        // Sort events by datetime for better UX
        const sortedEvents = events
            .map((event, originalIndex) => ({ ...event, originalIndex }))
            .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

        await showEventSelectPage(interaction, sortedEvents, locations, 0, 'remove');

    } catch (error) {
        console.error('Error in handleRemoveEvent:', error);
        await interaction.reply({
            content: `❌ Error reading events: ${error.message}`,
            ephemeral: true
        });
    }
}

async function showLocationSelectPage(interaction, locations, page, action) {
    const chunks = chunkArray(locations, MAX_SELECT_OPTIONS);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    if (!currentChunk || currentChunk.length === 0) {
        await interaction.reply({
            content: '❌ No locations found on this page.',
            ephemeral: true
        });
        return;
    }

    // Create select menu with current page locations
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`events_${action}_location_select`)
        .setPlaceholder(`Select a location (Page ${page + 1}/${totalPages})`)
        .addOptions(
            currentChunk.map((location, index) => ({
                label: truncateForSelectMenu(`${location.location} - ${location.venue}`),
                value: (page * MAX_SELECT_OPTIONS + index).toString(),
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
                    .setCustomId(`events_${action}_location_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`events_${action}_location_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const content = `**📅 ${action === 'add' ? 'Add New Event' : 'Remove Event'}**\n\nSelect a location (Page ${page + 1} of ${totalPages}):`;

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
            ephemeral: true
        });
    }
}

async function showEventSelectPage(interaction, sortedEvents, locations, page, action) {
    const chunks = chunkArray(sortedEvents, MAX_SELECT_OPTIONS);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    if (!currentChunk || currentChunk.length === 0) {
        await interaction.reply({
            content: '❌ No events found on this page.',
            ephemeral: true
        });
        return;
    }

    // Create select menu with current page events
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('events_remove_select')
        .setPlaceholder(`Select an event to remove (Page ${page + 1}/${totalPages})`)
        .addOptions(
            currentChunk.map((event) => {
                const location = locations.find(loc => loc.id === event.locationId);
                const locationName = location ? `${location.location} - ${location.venue}` : event.locationId;
                const displayText = `${formatDateTime(event.datetime)} - ${locationName}`;

                return {
                    label: truncateForSelectMenu(displayText),
                    value: event.originalIndex.toString(),
                    description: truncateForSelectMenu(`Location ID: ${event.locationId}`)
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
                    .setCustomId(`events_remove_event_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`events_remove_event_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const content = `**🗑️ Remove Event**\n\nSelect the event you want to remove (Page ${page + 1} of ${totalPages}):`;

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
            ephemeral: true
        });
    }
}

async function handleViewEvents(interaction) {
    try {
        const { data: events } = await getFileContent(EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (events.length === 0) {
            await interaction.reply({
                content: '❌ No events found.',
                ephemeral: true
            });
            return;
        }

        // Sort events by date for better display
        const sortedEvents = events.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Discord embed limit is 25 fields, so we need to paginate
        const EVENTS_PER_PAGE = 25;
        const totalPages = Math.ceil(sortedEvents.length / EVENTS_PER_PAGE);
        const currentPage = 0; // Start with first page

        await showEventsPage(interaction, sortedEvents, locations, currentPage, totalPages);

    } catch (error) {
        console.error('Error in handleViewEvents:', error);
        await interaction.reply({
            content: `❌ Error reading events: ${error.message}`,
            ephemeral: true
        });
    }
}

async function showEventsPage(interaction, sortedEvents, locations, page, totalPages) {
    const EVENTS_PER_PAGE = 25;
    const startIndex = page * EVENTS_PER_PAGE;
    const endIndex = Math.min(startIndex + EVENTS_PER_PAGE, sortedEvents.length);
    const pageEvents = sortedEvents.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle('📅 All Events')
        .setColor(0x0099FF)
        .setDescription(`Showing events ${startIndex + 1}-${endIndex} of ${sortedEvents.length} (Page ${page + 1} of ${totalPages})`);

    pageEvents.forEach((event, index) => {
        const location = locations.find(loc => loc.id === event.locationId);
        const locationName = location ? `${location.location} - ${location.venue}` : `Unknown (${event.locationId})`;
        const eventDate = new Date(event.date).toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        embed.addFields({
            name: `${startIndex + index + 1}. ${event.name}`,
            value: `📍 **Location:** ${locationName}\n📅 **Date:** ${eventDate}\n⏰ **Time:** ${event.time}\n🆔 **Event ID:** \`${event.locationId}\``,
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
                    .setCustomId(`events_view_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`events_view_next_${page + 1}`)
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
            ephemeral: true
        });
    }
}

// Add this to handle the view pagination buttons
async function handleViewEventsPagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: events } = await getFileContent(EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        const sortedEvents = events.sort((a, b) => new Date(a.date) - new Date(b.date));
        const totalPages = Math.ceil(sortedEvents.length / 25);

        await showEventsPage(interaction, sortedEvents, locations, page, totalPages);
    } catch (error) {
        console.error('Error in handleViewEventsPagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle button interactions for pagination
export async function handleEventsButton(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.includes('_location_prev_') || customId.includes('_location_next_')) {
        await handleLocationPagination(interaction, customId);
    } else if (customId.includes('_event_prev_') || customId.includes('_event_next_')) {
        await handleEventPagination(interaction, customId);
    } else if (customId.includes('_view_prev_') || customId.includes('_view_next_')) {
        await handleViewEventsPagination(interaction, customId);
    }
}

async function handleLocationPagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());
        const action = customId.includes('_add_') ? 'add' : 'remove';

        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);
        await showLocationSelectPage(interaction, locations, page, action);
    } catch (error) {
        console.error('Error in handleLocationPagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleEventPagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: events } = await getFileContent(EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        const sortedEvents = events
            .map((event, originalIndex) => ({ ...event, originalIndex }))
            .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

        await showEventSelectPage(interaction, sortedEvents, locations, page, 'remove');
    } catch (error) {
        console.error('Error in handleEventPagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle modal submissions
export async function handleEventsModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('events_add_datetime_')) {
        await handleAddEventModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddEventModal(interaction, deploymentPoller, auditLogger) {
    const dateTimeString = interaction.fields.getTextInputValue('datetime').trim();

    const pendingEvent = interaction.client.pendingEvents?.get(interaction.user.id);

    if (!pendingEvent) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            ephemeral: true
        });
        return;
    }

    // Validate datetime format
    if (!isValidDateTime(dateTimeString)) {
        await interaction.reply({
            content: '❌ Invalid date/time format. Please use YYYY-MM-DDTHH:MM:SS format.\n\nExample: 2025-09-06T18:00:00',
            ephemeral: true
        });
        return;
    }

    try {
        // Check if this exact event already exists
        const { data: events, sha } = await getFileContent(EVENTS_FILE_PATH);
        const existingEvent = events.find(event =>
            event.locationId === pendingEvent.locationId &&
            event.datetime === dateTimeString
        );

        if (existingEvent) {
            await interaction.reply({
                content: '❌ An event already exists at this location and time. Please choose a different date/time.',
                ephemeral: true
            });
            return;
        }

        // Add the new event
        const newEvent = {
            locationId: pendingEvent.locationId,
            datetime: dateTimeString
        };

        events.push(newEvent);

        const commitSha = await updateFileContent(
            EVENTS_FILE_PATH,
            events,
            sha,
            `Add event: ${formatDateTime(dateTimeString)} at ${pendingEvent.locationName}`
        );

        await interaction.reply({
            content: `✅ **Event Added Successfully!**\n\n**Date & Time:** ${formatDateTime(dateTimeString)}\n**Location:** ${pendingEvent.locationName}\n**Location ID:** \`${pendingEvent.locationId}\`\n\n🚀 Deploying changes...`,
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
            'Event Added',
            `Added event "${formatDateTime(dateTimeString)}" at ${pendingEvent.locationName} (${pendingEvent.locationId}) to ${EVENTS_FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingEvents.delete(interaction.user.id);

    } catch (error) {
        console.error('Error adding event:', error);
        await interaction.reply({
            content: `❌ Error adding event: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle select menu interactions
export async function handleEventsSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'events_add_location_select') {
        await handleAddEventLocationSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'events_remove_select') {
        await handleRemoveEventSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    }
}

async function handleAddEventLocationSelect(interaction, locationIndex, deploymentPoller, auditLogger) {
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

        // Show modal for datetime input
        const modal = new ModalBuilder()
            .setCustomId(`events_add_datetime_${Date.now()}`)
            .setTitle(`Add Event at ${selectedLocation.location}`);

        const datetimeInput = new TextInputBuilder()
            .setCustomId('datetime')
            .setLabel('Date and Time (YYYY-MM-DDTHH:MM:SS)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('2025-09-06T18:00:00')
            .setRequired(true)
            .setMaxLength(19);

        const actionRow = new ActionRowBuilder().addComponents(datetimeInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);

        // Store the location info for when modal is submitted
        interaction.client.pendingEvents = interaction.client.pendingEvents || new Map();
        interaction.client.pendingEvents.set(interaction.user.id, {
            locationId: selectedLocation.id,
            locationName: locationName
        });

    } catch (error) {
        console.error('Error in handleAddEventLocationSelect:', error);
        await interaction.reply({
            content: `❌ Error reading location: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveEventSelect(interaction, eventIndex, deploymentPoller, auditLogger) {
    try {
        const { data: events, sha } = await getFileContent(EVENTS_FILE_PATH);
        const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

        if (eventIndex < 0 || eventIndex >= events.length) {
            await interaction.reply({
                content: '❌ Event not found.',
                ephemeral: true
            });
            return;
        }

        // Remove event
        const removedEvent = events.splice(eventIndex, 1)[0];
        const location = locations.find(loc => loc.id === removedEvent.locationId);
        const locationName = location ? `${location.location} - ${location.venue}` : removedEvent.locationId;

        const commitSha = await updateFileContent(
            EVENTS_FILE_PATH,
            events,
            sha,
            `Remove event: ${formatDateTime(removedEvent.datetime)} at ${locationName}`
        );

        await interaction.reply({
            content: `✅ **Event Removed Successfully!**\n\n**Date & Time:** ${formatDateTime(removedEvent.datetime)}\n**Location:** ${locationName}\n**Location ID:** \`${removedEvent.locationId}\`\n\n🚀 Deploying changes...`,
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
            'Event Removed',
            `Removed event "${formatDateTime(removedEvent.datetime)}" at ${locationName} (${removedEvent.locationId}) from ${EVENTS_FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing event:', error);
        await interaction.reply({
            content: `❌ Error removing event: ${error.message}`,
            ephemeral: true
        });
    }
}
