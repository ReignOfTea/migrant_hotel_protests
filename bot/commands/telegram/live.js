import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const FILE_PATH = 'data/live.json';
const TIMES_FILE_PATH = 'data/times.json';
const ITEMS_PER_PAGE = 10;

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

    if (diffMinutes < -60) return '🔴';
    if (diffMinutes <= 60) return '🟡';
    return '🟢';
}

// Create paginated keyboard
function createPaginatedKeyboard(items, page, itemsPerPage, callbackPrefix, displayFunction) {
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    const totalPages = Math.ceil(items.length / itemsPerPage);

    const keyboard = new InlineKeyboard();

    // Add items for current page
    for (let i = startIndex; i < endIndex; i++) {
        const displayText = displayFunction(items[i], i);
        keyboard.text(displayText, `${callbackPrefix}_${i}`).row();
    }

    // Add pagination controls if needed
    if (totalPages > 1) {
        const paginationRow = [];

        if (page > 0) {
            paginationRow.push({ text: '◀️ Previous', callback_data: `${callbackPrefix}_page_${page - 1}` });
        }

        paginationRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });

        if (page < totalPages - 1) {
            paginationRow.push({ text: 'Next ▶️', callback_data: `${callbackPrefix}_page_${page + 1}` });
        }

        keyboard.row(...paginationRow);
    }

    keyboard.text('Cancel', 'cancel');
    return keyboard;
}

export function registerLiveCommands(bot, deploymentPoller = null) {
    // Main live command
    bot.command('live', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('Add Live Stream', 'live_add')
            .text('Remove Live Stream', 'live_remove')
            .row()
            .text('View All', 'live_view');

        await ctx.reply('What would you like to do with live streams?', {
            reply_markup: keyboard
        });
    });

    // View all live streams
    bot.callbackQuery('live_view', async (ctx) => {
        try {
            const { data: liveStreams } = await getFileContent(FILE_PATH);

            if (liveStreams.length === 0) {
                await ctx.editMessageText('No live streams found.');
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

            let message = '**All Live Streams:**\n\n🟢 Future | 🟡 Live/Soon | 🔴 Past\n\n';

            sortedStreams.forEach((event, index) => {
                const status = getTimeStatus(event.datetime);
                message += `**${index + 1}. ${event.locationId}** ${status}\n`;
                message += `📅 ${formatDateTime(event.datetime)}\n`;

                event.live.forEach((stream, streamIndex) => {
                    message += `• **${stream.name}**`;
                    if (stream.comment) message += ` - ${stream.comment}`;
                    message += `\n  🔗 [${stream.logo || 'Link'}](${stream.link})\n`;
                });
                message += '\n';
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add live stream flow - show time selection
    bot.callbackQuery('live_add', async (ctx) => {
        await showTimeSelection(ctx, 0, 'add');
    });

    // Handle time pagination for add live stream
    bot.callbackQuery(/^live_add_time_page_(\d+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await showTimeSelection(ctx, page, 'add');
    });

    async function showTimeSelection(ctx, page, action) {
        try {
            const { data: times } = await getFileContent(TIMES_FILE_PATH);

            if (times.length === 0) {
                await ctx.editMessageText('No scheduled times found. Please add times first.');
                return;
            }

            // Sort times by closest to now and add original index
            const sortedTimes = sortTimesByClosestToNow(
                times.map((time, originalIndex) => ({ ...time, originalIndex }))
            );

            const keyboard = createPaginatedKeyboard(
                sortedTimes,
                page,
                ITEMS_PER_PAGE,
                `live_${action}_time`,
                (time, index) => {
                    const status = getTimeStatus(time.datetime);
                    return `${status} ${time.locationId} - ${formatDateTime(time.datetime)}`;
                }
            );

            const actionText = action === 'add' ? 'Add Live Stream' : 'Remove Live Stream';
            await ctx.editMessageText(
                `**${actionText}**\n\nSelect a time/location:\n\n🟢 Future | 🟡 Live/Soon | 🔴 Past`,
                {
                    reply_markup: keyboard,
                    parse_mode: 'Markdown'
                }
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    }

    // Handle time selection for add
    bot.callbackQuery(/^live_add_time_(\d+)$/, async (ctx) => {
        try {
            const timeIndex = parseInt(ctx.match[1]);
            const { data: times } = await getFileContent(TIMES_FILE_PATH);

            // Get sorted times to match the display order
            const sortedTimes = sortTimesByClosestToNow(
                times.map((time, originalIndex) => ({ ...time, originalIndex }))
            );

            if (timeIndex < 0 || timeIndex >= sortedTimes.length) {
                await ctx.editMessageText('Selected time not found.');
                return;
            }

            const selectedTime = sortedTimes[timeIndex];
            const status = getTimeStatus(selectedTime.datetime);

            sessionManager.set(ctx.from.id, {
                command: 'live',
                action: 'add_stream_name',
                locationId: selectedTime.locationId,
                datetime: selectedTime.datetime
            });

            await ctx.editMessageText(
                `**Selected:** ${selectedTime.locationId} ${status}\n**Time:** ${formatDateTime(selectedTime.datetime)}\n\nPlease enter the stream name (e.g., "Ay Audits"):`
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Remove live stream flow - show live streams with pagination
    bot.callbackQuery('live_remove', async (ctx) => {
        await showLiveStreamRemovalSelection(ctx, 0);
    });

    // Handle live stream pagination for remove
    bot.callbackQuery(/^live_remove_page_(\d+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await showLiveStreamRemovalSelection(ctx, page);
    });

    async function showLiveStreamRemovalSelection(ctx, page) {
        try {
            const { data: liveStreams } = await getFileContent(FILE_PATH);

            if (liveStreams.length === 0) {
                await ctx.editMessageText('No live streams to remove.');
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

            const sortedStreams = flattenedStreams.sort((a, b) => {
                const now = new Date();
                const dateA = new Date(a.datetime);
                const dateB = new Date(b.datetime);
                const diffA = Math.abs(dateA - now);
                const diffB = Math.abs(dateB - now);
                return diffA - diffB;
            });

            const keyboard = createPaginatedKeyboard(
                sortedStreams,
                page,
                ITEMS_PER_PAGE,
                'live_remove',
                (stream, index) => {
                    const status = getTimeStatus(stream.datetime);
                    return `${status} ${stream.displayName}`;
                }
            );

            await ctx.editMessageText(
                'Select a live stream to remove:\n\n🟢 Future | 🟡 Live/Soon | 🔴 Past',
                {
                    reply_markup: keyboard
                }
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    }

    // Handle remove live stream selection
    bot.callbackQuery(/^live_remove_(\d+)$/, async (ctx) => {
        try {
            const streamIndex = parseInt(ctx.match[1]);
            const { data: liveStreams, sha } = await getFileContent(FILE_PATH);

            // Rebuild flattened streams to get the correct indices
            const flattenedStreams = [];
            liveStreams.forEach((event, eventIndex) => {
                event.live.forEach((stream, streamIdx) => {
                    flattenedStreams.push({
                        ...stream,
                        locationId: event.locationId,
                        datetime: event.datetime,
                        eventIndex,
                        streamIndex: streamIdx
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

            if (streamIndex < 0 || streamIndex >= sortedStreams.length) {
                await ctx.editMessageText('Stream not found.');
                return;
            }

            const streamToRemove = sortedStreams[streamIndex];
            const event = liveStreams[streamToRemove.eventIndex];

            // Remove stream
            const removedStream = event.live.splice(streamToRemove.streamIndex, 1)[0];

            // If no streams left in event, remove the entire event
            if (event.live.length === 0) {
                liveStreams.splice(streamToRemove.eventIndex, 1);
            }

            const commitSha = await updateFileContent(
                FILE_PATH,
                liveStreams,
                sha,
                `Remove live stream: ${removedStream.name} from ${event.locationId} at ${event.datetime}`
            );

            const status = getTimeStatus(event.datetime);
            const message = await ctx.editMessageText(
                `✅ Removed live stream: **${removedStream.name}**\n📍 ${event.locationId} ${status}\n📅 ${formatDateTime(event.datetime)}\n\n🔄 Deploying to website...`,
                { parse_mode: 'Markdown' }
            );

            if (deploymentPoller) {
                deploymentPoller.addPendingDeployment(
                    ctx.from.id,
                    ctx.chat.id,
                    message.message_id,
                    commitSha
                );
            }
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle noop callback (for page indicator)
    bot.callbackQuery('noop', async (ctx) => {
        await ctx.answerCallbackQuery();
    });
}

export async function handleLiveTextInput(ctx, deploymentPoller = null) {
    const session = sessionManager.get(ctx.from.id);

    try {
        if (session.action === 'add_stream_name') {
            const name = ctx.message.text.trim();
            session.name = name;
            session.action = 'add_stream_link';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply(`Great! Now enter the stream link for **${name}** (e.g., "https://www.youtube.com/watch?v=..."):`);

        } else if (session.action === 'add_stream_link') {
            const link = ctx.message.text.trim();

            if (!isValidUrl(link)) {
                await ctx.reply('❌ Invalid URL format. Please provide a valid URL:');
                return;
            }

            session.link = link;
            session.action = 'add_stream_comment';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply('Perfect! Now enter a comment (optional, or type "skip"):');

        } else if (session.action === 'add_stream_comment') {
            const comment = ctx.message.text.trim();
            session.comment = comment.toLowerCase() === 'skip' ? '' : comment;
            session.action = 'add_stream_logo';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply('Finally, enter the platform/logo name (optional, e.g., "youtube", "twitch", or type "skip"):');

        } else if (session.action === 'add_stream_logo') {
            const logo = ctx.message.text.trim();
            const finalLogo = logo.toLowerCase() === 'skip' ? '' : logo;

            // Add the new live stream
            const { data: liveStreams, sha } = await getFileContent(FILE_PATH);

            // Find existing event or create new one
            let existingEventIndex = liveStreams.findIndex(
                event => event.locationId === session.locationId && event.datetime === session.datetime
            );

            const newStream = {
                link: session.link,
                name: session.name,
                comment: session.comment || undefined,
                logo: finalLogo || undefined
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
                    locationId: session.locationId,
                    datetime: session.datetime,
                    live: [newStream]
                };
                liveStreams.push(newEvent);
            }

            const commitSha = await updateFileContent(
                FILE_PATH,
                liveStreams,
                sha,
                `Add live stream: ${session.name} for ${session.locationId} at ${session.datetime}`
            );

            const status = getTimeStatus(session.datetime);
            let messageText = `✅ Added new live stream:\n\n**${session.name}**\n📍 ${session.locationId} ${status}\n📅 ${formatDateTime(session.datetime)}\n🔗 ${session.link}`;

            if (session.comment) messageText += `\n💬 ${session.comment}`;
            if (finalLogo) messageText += `\n🏷️ ${finalLogo}`;

            messageText += '\n\n🔄 Deploying to website...';

            const message = await ctx.reply(messageText, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

            if (deploymentPoller) {
                deploymentPoller.addPendingDeployment(
                    ctx.from.id,
                    ctx.chat.id,
                    message.message_id,
                    commitSha
                );
            }

            sessionManager.delete(ctx.from.id);
        }
    } catch (error) {
        await ctx.reply(`Error: ${error.message}`);
        sessionManager.delete(ctx.from.id);
    }
}
