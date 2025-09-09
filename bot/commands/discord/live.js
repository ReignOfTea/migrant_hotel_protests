import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const FILE_PATH = 'data/live.json';
const TIMES_FILE_PATH = 'data/times.json';
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

// Validate URL format
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Format datetime for display
function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London'
    });
}

// Sort times by closest to now (past or future)
function sortTimesByClosestToNow(times) {
    const now = new Date();
    return times.sort((a, b) => {
        const dateA = new Date(a.datetime);
        const dateB = new Date(b.datetime);
        const diffA = Math.abs(dateA - now);
        const diffB = Math.abs(dateB - now);
        return diffA - diffB;
    });
}

// Get time status (Past/Future/Live)
function getTimeStatus(datetime) {
    const now = new Date();
    const eventTime = new Date(datetime);
    const diffMinutes = (eventTime - now) / (1000 * 60);

    if (diffMinutes < -60) return '🔴 Past';
    if (diffMinutes <= 60) return '🟡 Live/Soon';
    return '🟢 Future';
}

export function createLiveCommand() {
    return new SlashCommandBuilder()
        .setName('live')
        .setDescription('Manage live streams')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new live stream'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a live stream'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all live streams'));
}

export async function handleLiveCommand(interaction, deploymentPoller, auditLogger) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'add':
            await handleAddLive(interaction, deploymentPoller, auditLogger);
            break;
        case 'remove':
            await handleRemoveLive(interaction, deploymentPoller, auditLogger);
            break;
        case 'view':
            await handleViewLive(interaction);
            break;
    }
}

async function handleAddLive(interaction, deploymentPoller, auditLogger) {
    try {
        // Get available times
        const { data: times } = await getFileContent(TIMES_FILE_PATH);

        if (times.length === 0) {
            await interaction.reply({
                content: '❌ No scheduled times found. Please add times first using `/times add`.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort times by closest to now and add original index
        const sortedTimes = sortTimesByClosestToNow(
            times.map((time, originalIndex) => ({ ...time, originalIndex }))
        );

        await showTimeSelectPage(interaction, sortedTimes, 0, 'add');

    } catch (error) {
        console.error('Error in handleAddLive:', error);
        await interaction.reply({
            content: `❌ Error loading times: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showTimeSelectPage(interaction, sortedTimes, page, action) {
    const chunks = chunkArray(sortedTimes, MAX_SELECT_OPTIONS);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    if (!currentChunk || currentChunk.length === 0) {
        await interaction.reply({
            content: '❌ No times found on this page.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Create select menu with current page times
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`live_${action}_time_select`)
        .setPlaceholder(`Select a time for the live stream (Page ${page + 1}/${totalPages})`)
        .addOptions(
            currentChunk.map((time) => {
                const status = getTimeStatus(time.datetime);
                const displayText = `${time.locationId} - ${formatDateTime(time.datetime)}`;
                return {
                    label: truncateForSelectMenu(displayText),
                    value: time.originalIndex.toString(),
                    description: truncateForSelectMenu(`${status} | ID: ${time.locationId}`)
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
                    .setCustomId(`live_${action}_time_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`live_${action}_time_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const actionText = action === 'add' ? 'Add Live Stream' : 'Remove Live Stream';
    const content = `**📺 ${actionText}**\n\nSelect the time/location for this live stream (Page ${page + 1} of ${totalPages}):\n\n🟢 Future | 🟡 Live/Soon | 🔴 Past`;

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

async function handleRemoveLive(interaction, deploymentPoller, auditLogger) {
    try {
        const { data: liveStreams } = await getFileContent(FILE_PATH);

        if (liveStreams.length === 0) {
            await interaction.reply({
                content: '❌ No live streams found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Flatten live streams for selection and sort by closest to now
        const flattenedStreams = [];
        liveStreams.forEach((event, eventIndex) => {
            event.live.forEach((stream, streamIndex) => {
                flattenedStreams.push({
                    ...stream,
                    locationId: event.locationId,
                    datetime: event.datetime,
                    eventIndex,
                    streamIndex,
                    displayName: `${stream.name} - ${event.locationId} (${formatDateTime(event.datetime)})`
                });
            });
        });

        // Sort by closest to now
        const sortedStreams = flattenedStreams.sort((a, b) => {
            const now = new Date();
            const dateA = new Date(a.datetime);
            const dateB = new Date(b.datetime);
            const diffA = Math.abs(dateA - now);
            const diffB = Math.abs(dateB - now);
            return diffA - diffB;
        });

        await showLiveSelectPage(interaction, sortedStreams, 0, 'remove');

    } catch (error) {
        console.error('Error in handleRemoveLive:', error);
        await interaction.reply({
            content: `❌ Error reading live streams: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showLiveSelectPage(interaction, flattenedStreams, page, action) {
    const chunks = chunkArray(flattenedStreams, MAX_SELECT_OPTIONS);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    if (!currentChunk || currentChunk.length === 0) {
        await interaction.reply({
            content: '❌ No live streams found on this page.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Create select menu with current page streams
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('live_remove_select')
        .setPlaceholder(`Select a live stream to remove (Page ${page + 1}/${totalPages})`)
        .addOptions(
            currentChunk.map((stream) => {
                const status = getTimeStatus(stream.datetime);
                return {
                    label: truncateForSelectMenu(stream.displayName),
                    value: `${stream.eventIndex}-${stream.streamIndex}`,
                    description: truncateForSelectMenu(`${status} | ${stream.comment || 'No comment'}`)
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
                    .setCustomId(`live_remove_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`live_remove_next_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        components.push(navigationRow);
    }

    const content = `**🗑️ Remove Live Stream**\n\nSelect the live stream you want to remove (Page ${page + 1} of ${totalPages}):\n\n🟢 Future | 🟡 Live/Soon | 🔴 Past`;

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

async function handleViewLive(interaction) {
    try {
        const { data: liveStreams } = await getFileContent(FILE_PATH);

        if (liveStreams.length === 0) {
            await interaction.reply({
                content: '❌ No live streams found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Sort by closest to now
        const sortedStreams = liveStreams.sort((a, b) => {
            const now = new Date();
            const dateA = new Date(a.datetime);
            const dateB = new Date(b.datetime);
            const diffA = Math.abs(dateA - now);
            const diffB = Math.abs(dateB - now);
            return diffA - diffB;
        });

        const STREAMS_PER_PAGE = 10;
        const totalPages = Math.ceil(sortedStreams.length / STREAMS_PER_PAGE);
        const currentPage = 0;

        await showLivePage(interaction, sortedStreams, currentPage, totalPages);

    } catch (error) {
        console.error('Error in handleViewLive:', error);
        await interaction.reply({
            content: `❌ Error reading live streams: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function showLivePage(interaction, sortedStreams, page, totalPages) {
    const STREAMS_PER_PAGE = 10;
    const startIndex = page * STREAMS_PER_PAGE;
    const endIndex = Math.min(startIndex + STREAMS_PER_PAGE, sortedStreams.length);
    const pageStreams = sortedStreams.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle('📺 All Live Streams')
        .setColor(0xFF0000)
        .setDescription(`Showing events ${startIndex + 1}-${endIndex} of ${sortedStreams.length} (Page ${page + 1} of ${totalPages})\n\n🟢 Future | 🟡 Live/Soon | 🔴 Past`);

    pageStreams.forEach((event, index) => {
        const status = getTimeStatus(event.datetime);
        const streamList = event.live.map(stream =>
            `• **${stream.name}** ${stream.comment ? `- ${stream.comment}` : ''}\n  🔗 [${stream.logo || 'Link'}](${stream.link})`
        ).join('\n');

        embed.addFields({
            name: `${startIndex + index + 1}. ${event.locationId} ${status}`,
            value: `📅 **Date/Time:** ${formatDateTime(event.datetime)}\n📍 **Location:** ${event.locationId}\n\n**Live Streams:**\n${streamList}`,
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
                    .setCustomId(`live_view_prev_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (page < totalPages - 1) {
            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`live_view_next_${page + 1}`)
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

// Handle button interactions for pagination
export async function handleLiveButton(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.includes('_add_time_prev_') || customId.includes('_add_time_next_')) {
        await handleTimeSelectPagination(interaction, customId, 'add');
    } else if (customId.includes('_remove_prev_') || customId.includes('_remove_next_')) {
        await handleLivePagination(interaction, customId);
    } else if (customId.includes('_view_prev_') || customId.includes('_view_next_')) {
        await handleViewLivePagination(interaction, customId);
    }
}

async function handleTimeSelectPagination(interaction, customId, action) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: times } = await getFileContent(TIMES_FILE_PATH);
        const sortedTimes = sortTimesByClosestToNow(
            times.map((time, originalIndex) => ({ ...time, originalIndex }))
        );

        await showTimeSelectPage(interaction, sortedTimes, page, action);
    } catch (error) {
        console.error('Error in handleTimeSelectPagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleLivePagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: liveStreams } = await getFileContent(FILE_PATH);
        const flattenedStreams = [];
        liveStreams.forEach((event, eventIndex) => {
            event.live.forEach((stream, streamIndex) => {
                flattenedStreams.push({
                    ...stream,
                    locationId: event.locationId,
                    datetime: event.datetime,
                    eventIndex,
                    streamIndex,
                    displayName: `${stream.name} - ${event.locationId} (${formatDateTime(event.datetime)})`
                });
            });
        });

        const sortedStreams = flattenedStreams.sort((a, b) => {
            const now = new Date();
            const dateA = new Date(a.datetime);
            const dateB = new Date(b.datetime);
            const diffA = Math.abs(dateA - now);
            const diffB = Math.abs(dateB - now);
            return diffA - diffB;
        });

        await showLiveSelectPage(interaction, sortedStreams, page, 'remove');
    } catch (error) {
        console.error('Error in handleLivePagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleViewLivePagination(interaction, customId) {
    try {
        const page = parseInt(customId.split('_').pop());

        const { data: liveStreams } = await getFileContent(FILE_PATH);
        const sortedStreams = liveStreams.sort((a, b) => {
            const now = new Date();
            const dateA = new Date(a.datetime);
            const dateB = new Date(b.datetime);
            const diffA = Math.abs(dateA - now);
            const diffB = Math.abs(dateB - now);
            return diffA - diffB;
        });
        const totalPages = Math.ceil(sortedStreams.length / 10);

        await showLivePage(interaction, sortedStreams, page, totalPages);
    } catch (error) {
        console.error('Error in handleViewLivePagination:', error);
        await interaction.reply({
            content: `❌ Error loading page: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle select menu interactions
export async function handleLiveSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId === 'live_add_time_select') {
        await handleTimeSelectForAdd(interaction);
    } else if (customId === 'live_remove_select') {
        const [eventIndex, streamIndex] = interaction.values[0].split('-').map(Number);
        await handleRemoveLiveSelect(interaction, eventIndex, streamIndex, deploymentPoller, auditLogger);
    }
}

async function handleTimeSelectForAdd(interaction) {
    try {
        const selectedTimeIndex = parseInt(interaction.values[0]);
        const { data: times } = await getFileContent(TIMES_FILE_PATH);

        if (selectedTimeIndex < 0 || selectedTimeIndex >= times.length) {
            await interaction.reply({
                content: '❌ Selected time not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const selectedTime = times[selectedTimeIndex];

        // Show modal for live stream details
        const modal = new ModalBuilder()
            .setCustomId(`live_add_${selectedTime.locationId}_${selectedTime.datetime}_${Date.now()}`)
            .setTitle('Add Live Stream Details');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Stream Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Ay Audits')
            .setRequired(true)
            .setMaxLength(100);

        const linkInput = new TextInputBuilder()
            .setCustomId('link')
            .setLabel('Stream Link')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., https://www.youtube.com/watch?v=...')
            .setRequired(true)
            .setMaxLength(500);

        const commentInput = new TextInputBuilder()
            .setCustomId('comment')
            .setLabel('Comment (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., is covering this protest!')
            .setRequired(false)
            .setMaxLength(200);

        const logoInput = new TextInputBuilder()
            .setCustomId('logo')
            .setLabel('Logo/Platform (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., youtube, twitch, facebook')
            .setRequired(false)
            .setMaxLength(50);

        const nameRow = new ActionRowBuilder().addComponents(nameInput);
        const linkRow = new ActionRowBuilder().addComponents(linkInput);
        const commentRow = new ActionRowBuilder().addComponents(commentInput);
        const logoRow = new ActionRowBuilder().addComponents(logoInput);

        modal.addComponents(nameRow, linkRow, commentRow, logoRow);

        await interaction.showModal(modal);

    } catch (error) {
        console.error('Error in handleTimeSelectForAdd:', error);
        await interaction.reply({
            content: `❌ Error processing selection: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle modal submissions
export async function handleLiveModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('live_add_')) {
        await handleAddLiveModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddLiveModal(interaction, deploymentPoller, auditLogger) {
    const customIdParts = interaction.customId.split('_');
    const locationId = customIdParts[2];
    const datetime = customIdParts[3];

    const name = interaction.fields.getTextInputValue('name').trim();
    const link = interaction.fields.getTextInputValue('link').trim();
    const comment = interaction.fields.getTextInputValue('comment').trim();
    const logo = interaction.fields.getTextInputValue('logo').trim();

    // Validate URL
    if (!isValidUrl(link)) {
        await interaction.reply({
            content: '❌ Invalid URL format. Please provide a valid URL.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        const { data: liveStreams, sha } = await getFileContent(FILE_PATH);

        // Find existing event or create new one
        let existingEventIndex = liveStreams.findIndex(
            event => event.locationId === locationId && event.datetime === datetime
        );

        const newStream = {
            link: link,
            name: name,
            comment: comment || undefined,
            logo: logo || undefined
        };

        // Remove undefined properties
        Object.keys(newStream).forEach(key =>
            newStream[key] === undefined && delete newStream[key]
        );

        if (existingEventIndex !== -1) {
            // Add to existing event
            liveStreams[existingEventIndex].live.push(newStream);
        } else {
            // Create new event
            const newEvent = {
                locationId: locationId,
                datetime: datetime,
                live: [newStream]
            };
            liveStreams.push(newEvent);
        }

        const commitSha = await updateFileContent(
            FILE_PATH,
            liveStreams,
            sha,
            `Add live stream: ${name} for ${locationId} at ${datetime}`
        );

        const status = getTimeStatus(datetime);
        await interaction.reply({
            content: `✅ **Live Stream Added Successfully!**\n\n**Location:** ${locationId}\n**Date/Time:** ${formatDateTime(datetime)} ${status}\n**Stream:** ${name}\n**Link:** ${link}\n${comment ? `**Comment:** ${comment}\n` : ''}${logo ? `**Platform:** ${logo}\n` : ''}\n🚀 Deploying changes...`,
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
            'Live Stream Added',
            `Added "${name}" stream for ${locationId} at ${datetime} to ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error adding live stream:', error);
        await interaction.reply({
            content: `❌ Error adding live stream: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRemoveLiveSelect(interaction, eventIndex, streamIndex, deploymentPoller, auditLogger) {
    try {
        const { data: liveStreams, sha } = await getFileContent(FILE_PATH);

        if (eventIndex < 0 || eventIndex >= liveStreams.length) {
            await interaction.reply({
                content: '❌ Event not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const event = liveStreams[eventIndex];
        if (streamIndex < 0 || streamIndex >= event.live.length) {
            await interaction.reply({
                content: '❌ Stream not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Remove stream
        const removedStream = event.live.splice(streamIndex, 1)[0];

        // If no streams left in event, remove the entire event
        if (event.live.length === 0) {
            liveStreams.splice(eventIndex, 1);
        }

        const commitSha = await updateFileContent(
            FILE_PATH,
            liveStreams,
            sha,
            `Remove live stream: ${removedStream.name} from ${event.locationId} at ${event.datetime}`
        );

        const status = getTimeStatus(event.datetime);
        await interaction.reply({
            content: `✅ **Live Stream Removed Successfully!**\n\n**Removed:** ${removedStream.name}\n**Location:** ${event.locationId}\n**Date/Time:** ${formatDateTime(event.datetime)} ${status}\n\n🚀 Deploying changes...`,
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
            'Live Stream Removed',
            `Removed "${removedStream.name}" stream from ${event.locationId} at ${event.datetime} from ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing live stream:', error);
        await interaction.reply({
            content: `❌ Error removing live stream: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
