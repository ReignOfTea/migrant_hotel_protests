import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const FILE_PATH = 'data/locations.json';
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

// Generate ID from location and venue
function generateId(location, venue) {
    return `${location}-${venue}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

// Validate coordinates
function isValidCoordinate(lat, lng) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    return !isNaN(latitude) &&
        !isNaN(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;
}

export function createLocationsCommand() {
    return new SlashCommandBuilder()
        .setName('locations')
        .setDescription('Manage locations')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new location'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a location'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all locations'));
}

export async function handleLocationsCommand(interaction, deploymentPoller, auditLogger) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'add':
            await handleAddLocation(interaction, deploymentPoller, auditLogger);
            break;
        case 'remove':
            await handleRemoveLocation(interaction, deploymentPoller, auditLogger);
            break;
        case 'view':
            await handleViewLocations(interaction);
            break;
    }
}

async function handleAddLocation(interaction, deploymentPoller, auditLogger) {
    // Show modal for location input
    const modal = new ModalBuilder()
        .setCustomId(`locations_add_${Date.now()}`)
        .setTitle('Add New Location');

    const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Location Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., ALTRINCHAM')
        .setRequired(true)
        .setMaxLength(100);

    const venueInput = new TextInputBuilder()
        .setCustomId('venue')
        .setLabel('Venue Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., CRESTA COURT HOTEL')
        .setRequired(true)
        .setMaxLength(200);

    const latInput = new TextInputBuilder()
        .setCustomId('lat')
        .setLabel('Latitude')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 53.3881')
        .setRequired(true)
        .setMaxLength(20);

    const lngInput = new TextInputBuilder()
        .setCustomId('lng')
        .setLabel('Longitude')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., -2.3477')
        .setRequired(true)
        .setMaxLength(20);

    const locationRow = new ActionRowBuilder().addComponents(locationInput);
    const venueRow = new ActionRowBuilder().addComponents(venueInput);
    const latRow = new ActionRowBuilder().addComponents(latInput);
    const lngRow = new ActionRowBuilder().addComponents(lngInput);

    modal.addComponents(locationRow, venueRow, latRow, lngRow);

    await interaction.showModal(modal);
}

async function handleRemoveLocation(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: locations } = await getFileContent(FILE_PATH);

        if (locations.length === 0) {
            await interaction.reply({
                content: '❌ No locations found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort locations alphabetically for better UX
        const sortedLocations = locations
            .map((location, originalIndex) => ({ ...location, originalIndex }))
            .sort((a, b) => a.location.localeCompare(b.location));

        await showLocationSelectPage(interaction, sortedLocations, 0, 'remove');

    } catch (error) {
        console.error('Error in handleRemoveLocation:', error);
        await interaction.reply({
            content: `❌ Error reading locations: ${error.message}`,
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
        .setCustomId('locations_remove_select')
        .setPlaceholder(`Select a location to remove (Page ${page + 1}/${totalPages})`)
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
                    .setCustomId(`locations_remove_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`locations_remove_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const content = `**🗑️ Remove Location**\n\nSelect the location you want to remove (Page ${page + 1} of ${totalPages}):`;

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

async function handleViewLocations(interaction) {
    try {
        const { data: locations } = await getFileContent(FILE_PATH);

        if (locations.length === 0) {
            await interaction.reply({
                content: '❌ No locations found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort locations alphabetically for better display
        const sortedLocations = locations.sort((a, b) => a.location.localeCompare(b.location));

        // Discord embed limit is 25 fields, so we need to paginate
        const LOCATIONS_PER_PAGE = 25;
        const totalPages = Math.ceil(sortedLocations.length / LOCATIONS_PER_PAGE);
        const currentPage = 0; // Start with first page

        await showLocationsPage(interaction, sortedLocations, currentPage, totalPages);

    } catch (error) {
        console.error('Error in handleViewLocations:', error);
        await interaction.reply({
            content: `❌ Error reading locations: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showLocationsPage(interaction, sortedLocations, page, totalPages) {
    const LOCATIONS_PER_PAGE = 25;
    const startIndex = page * LOCATIONS_PER_PAGE;
    const endIndex = Math.min(startIndex + LOCATIONS_PER_PAGE, sortedLocations.length);
    const pageLocations = sortedLocations.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle('📍 All Locations')
        .setColor(0x0099FF)
        .setDescription(`Showing locations ${startIndex + 1}-${endIndex} of ${sortedLocations.length} (Page ${page + 1} of ${totalPages})`);

    pageLocations.forEach((location, index) => {
        embed.addFields({
            name: `${startIndex + index + 1}. ${location.location}`,
            value: `📍 **Venue:** ${location.venue}\n🆔 **ID:** \`${location.id}\`\n📍 **Coordinates:** ${location.lat}, ${location.lng}`,
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
                    .setCustomId(`locations_view_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`locations_view_next_${page + 1}`)
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
async function handleViewLocationsPagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: locations } = await getFileContent(FILE_PATH);
        const sortedLocations = locations.sort((a, b) => a.location.localeCompare(b.location));
        const totalPages = Math.ceil(sortedLocations.length / 25);

        await showLocationsPage(interaction, sortedLocations, page, totalPages);
    } catch (error) {
        console.error('Error in handleViewLocationsPagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle button interactions for pagination
export async function handleLocationsButton(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.includes('_remove_prev_') || customId.includes('_remove_next_')) {
        await handleLocationPagination(interaction, customId);
    } else if (customId.includes('_view_prev_') || customId.includes('_view_next_')) {
        await handleViewLocationsPagination(interaction, customId);
    }
}

async function handleLocationPagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: locations } = await getFileContent(FILE_PATH);
        const sortedLocations = locations
            .map((location, originalIndex) => ({ ...location, originalIndex }))
            .sort((a, b) => a.location.localeCompare(b.location));

        await showLocationSelectPage(interaction, sortedLocations, page, 'remove');
    } catch (error) {
        console.error('Error in handleLocationPagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle modal submissions
export async function handleLocationsModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('locations_add_')) {
        await handleAddLocationModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddLocationModal(interaction, deploymentPoller, auditLogger) {
    const location = interaction.fields.getTextInputValue('location').trim().toUpperCase();
    const venue = interaction.fields.getTextInputValue('venue').trim().toUpperCase();
    const latStr = interaction.fields.getTextInputValue('lat').trim();
    const lngStr = interaction.fields.getTextInputValue('lng').trim();

    // Validate inputs
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    // Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
        await interaction.reply({
            content: '❌ Invalid coordinates. Latitude must be between -90 and 90, longitude must be between -180 and 180.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const id = generateId(location, venue);

    try {
        // Check if ID already exists
        const { data: locations, sha } = await getFileContent(FILE_PATH);
        const existingLocation = locations.find(loc => loc.id === id);

        if (existingLocation) {
            await interaction.reply({
                content: `❌ A location with this combination already exists (ID: ${id}). Please choose a different location or venue name.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Add new location
        const newLocation = {
            id: id,
            location: location,
            venue: venue,
            lat: lat,
            lng: lng
        };

        locations.push(newLocation);

        const commitSha = await updateFileContent(
            FILE_PATH,
            locations,
            sha,
            `Add location: ${location} - ${venue}`
        );

        await interaction.reply({
            content: `✅ **Location Added Successfully!**\n\n**Location:** ${location}\n**Venue:** ${venue}\n**ID:** \`${id}\`\n**Coordinates:** ${lat}, ${lng}\n\n🚀 Deploying changes...`,
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
            'Location Added',
            `Added "${location} - ${venue}" (ID: ${id}) to ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error adding location:', error);
        await interaction.reply({
            content: `❌ Error adding location: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle select menu interactions
export async function handleLocationsSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'locations_remove_select') {
        await handleRemoveLocationSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    }
}

async function handleRemoveLocationSelect(interaction, locationIndex, deploymentPoller, auditLogger) {
    try {
        const { data: locations, sha } = await getFileContent(FILE_PATH);

        if (locationIndex < 0 || locationIndex >= locations.length) {
            await interaction.reply({
                content: '❌ Location not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Remove location
        const removedLocation = locations.splice(locationIndex, 1)[0];

        const commitSha = await updateFileContent(
            FILE_PATH,
            locations,
            sha,
            `Remove location: ${removedLocation.location} - ${removedLocation.venue}`
        );

        await interaction.reply({
            content: `✅ **Location Removed Successfully!**\n\n**Removed:** ${removedLocation.location} - ${removedLocation.venue}\n**ID:** \`${removedLocation.id}\`\n\n🚀 Deploying changes...`,
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
            'Location Removed',
            `Removed "${removedLocation.location} - ${removedLocation.venue}" (ID: ${removedLocation.id}) from ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing location:', error);
        await interaction.reply({
            content: `❌ Error removing location: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
