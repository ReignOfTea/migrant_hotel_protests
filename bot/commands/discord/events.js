import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const EVENTS_FILE_PATH = 'data/times.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';

// Helper function to truncate text for Discord select menu options
function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
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

        // Create select menu with available locations
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('events_add_location_select')
            .setPlaceholder('Select a location for the event')
            .addOptions(
                locations.map((location, index) => ({
                    label: truncateForSelectMenu(`${location.location} - ${location.venue}`),
                    value: index.toString(),
                    description: truncateForSelectMenu(`ID: ${location.id}`)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**📅 Add New Event**\n\nFirst, select a location for the event:',
            components: [row],
            ephemeral: true
        });

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

        // Create select menu with existing events
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('events_remove_select')
            .setPlaceholder('Select an event to remove')
            .addOptions(
                sortedEvents.map((event) => {
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

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🗑️ Remove Event**\n\nSelect the event you want to remove:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveEvent:', error);
        await interaction.reply({
            content: `❌ Error reading events: ${error.message}`,
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

        // Sort events by datetime
        const sortedEvents = events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

        const embed = new EmbedBuilder()
            .setTitle('📅 All Events')
            .setColor(0x0099FF)
            .setDescription(`Found ${events.length} event(s):`);

        sortedEvents.forEach((event, index) => {
            const location = locations.find(loc => loc.id === event.locationId);
            const locationName = location ? `${location.location} - ${location.venue}` : `Unknown (${event.locationId})`;

            embed.addFields({
                name: `${index + 1}. ${formatDateTime(event.datetime)}`,
                value: `📍 **Location:** ${locationName}\n🆔 **Location ID:** \`${event.locationId}\``,
                inline: false
            });
        });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleViewEvents:', error);
        await interaction.reply({
            content: `❌ Error reading events: ${error.message}`,
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