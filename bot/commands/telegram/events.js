import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const EVENTS_FILE_PATH = 'data/times.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';
const ITEMS_PER_PAGE = 10;

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

export function registerEventsCommands(bot, deploymentPoller = null) {
    // Main events command
    bot.command('events', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('Add Event', 'events_add')
            .text('Remove Event', 'events_remove')
            .row()
            .text('View All', 'events_view');

        await ctx.reply('What would you like to do with events?', {
            reply_markup: keyboard
        });
    });

    // View all events
    bot.callbackQuery('events_view', async (ctx) => {
        try {
            const { data: events } = await getFileContent(EVENTS_FILE_PATH);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            if (events.length === 0) {
                await ctx.editMessageText('No events found.');
                return;
            }

            // Sort events by datetime
            const sortedEvents = events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

            let message = '**All Events:**\n\n';
            sortedEvents.forEach((event, index) => {
                const location = locations.find(loc => loc.id === event.locationId);
                const locationName = location ? `${location.location} - ${location.venue}` : `Unknown (${event.locationId})`;

                message += `**${index + 1}. ${formatDateTime(event.datetime)}**\n`;
                message += `📍 ${locationName}\n`;
                message += `🆔 Location ID: \`${event.locationId}\`\n\n`;
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add event flow - show locations with pagination
    bot.callbackQuery('events_add', async (ctx) => {
        await showLocationSelection(ctx, 0);
    });

    // Handle location pagination for add event
    bot.callbackQuery(/^events_select_location_page_(\d+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await showLocationSelection(ctx, page);
    });

    async function showLocationSelection(ctx, page) {
        try {
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            if (locations.length === 0) {
                await ctx.editMessageText('No locations available. Please add locations first using /locations.');
                return;
            }

            const keyboard = createPaginatedKeyboard(
                locations,
                page,
                ITEMS_PER_PAGE,
                'events_select_location',
                (location, index) => `${location.location} - ${location.venue}`
            );

            await ctx.editMessageText('Select a location for the event:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    }

    // Handle location selection for new event
    bot.callbackQuery(/^events_select_location_(\d+)$/, async (ctx) => {
        try {
            const locationIndex = parseInt(ctx.match[1]);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);
            const selectedLocation = locations[locationIndex];

            sessionManager.set(ctx.from.id, {
                command: 'events',
                action: 'add_datetime',
                locationId: selectedLocation.id,
                locationName: `${selectedLocation.location} - ${selectedLocation.venue}`
            });

            await ctx.editMessageText(
                `Selected location: **${selectedLocation.location} - ${selectedLocation.venue}**\n\nNow enter the date and time in format: YYYY-MM-DDTHH:MM:SS\n\nExample: 2025-09-06T18:00:00\n\nYou'll be able to add an optional description in the next step.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Remove event flow - show events with pagination
    bot.callbackQuery('events_remove', async (ctx) => {
        await showEventSelection(ctx, 0);
    });

    // Handle event pagination for remove event
    bot.callbackQuery(/^events_remove_page_(\d+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await showEventSelection(ctx, page);
    });

    async function showEventSelection(ctx, page) {
        try {
            const { data: events } = await getFileContent(EVENTS_FILE_PATH);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            if (events.length === 0) {
                await ctx.editMessageText('No events to remove.');
                return;
            }

            // Sort events by datetime for better UX
            const sortedEvents = events
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

            const keyboard = createPaginatedKeyboard(
                sortedEvents,
                page,
                ITEMS_PER_PAGE,
                'events_remove',
                (event, index) => {
                    const location = locations.find(loc => loc.id === event.locationId);
                    const locationName = location ? `${location.location} - ${location.venue}` : event.locationId;
                    return `${formatDateTime(event.datetime)} - ${locationName}`;
                }
            );

            // Override callback data to use originalIndex
            const startIndex = page * ITEMS_PER_PAGE;
            const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, sortedEvents.length);

            // Rebuild keyboard with correct indices
            const newKeyboard = new InlineKeyboard();
            for (let i = startIndex; i < endIndex; i++) {
                const event = sortedEvents[i];
                const location = locations.find(loc => loc.id === event.locationId);
                const locationName = location ? `${location.location} - ${location.venue}` : event.locationId;
                const displayText = `${formatDateTime(event.datetime)} - ${locationName}`;
                newKeyboard.text(displayText, `events_remove_${event.originalIndex}`).row();
            }

            // Add pagination controls
            const totalPages = Math.ceil(sortedEvents.length / ITEMS_PER_PAGE);
            if (totalPages > 1) {
                const paginationRow = [];

                if (page > 0) {
                    paginationRow.push({ text: '◀️ Previous', callback_data: `events_remove_page_${page - 1}` });
                }

                paginationRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });

                if (page < totalPages - 1) {
                    paginationRow.push({ text: 'Next ▶️', callback_data: `events_remove_page_${page + 1}` });
                }

                newKeyboard.row(...paginationRow);
            }

            newKeyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select an event to remove:', {
                reply_markup: newKeyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    }

    // Handle remove event selection
    bot.callbackQuery(/^events_remove_(\d+)$/, async (ctx) => {
        try {
            const eventIndex = parseInt(ctx.match[1]);
            const { data: events, sha } = await getFileContent(EVENTS_FILE_PATH);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            const removedEvent = events.splice(eventIndex, 1)[0];
            const location = locations.find(loc => loc.id === removedEvent.locationId);
            const locationName = location ? `${location.location} - ${location.venue}` : removedEvent.locationId;

            const commitSha = await updateFileContent(
                EVENTS_FILE_PATH,
                events,
                sha,
                `Remove event: ${formatDateTime(removedEvent.datetime)} at ${locationName}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed event:\n\n**${formatDateTime(removedEvent.datetime)}**\n📍 ${locationName}\n\n🔄 Deploying to website...`,
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
    // Handle skip about button
    bot.callbackQuery('events_skip_about', async (ctx) => {
        const session = sessionManager.get(ctx.from.id);
        if (!session || session.action !== 'add_about') {
            await ctx.answerCallbackQuery('Session expired. Please start over.');
            return;
        }

        // Add the event without an about text
        const { data: eventsData, sha } = await getFileContent(EVENTS_FILE_PATH);

        const newEvent = {
            locationId: session.locationId,
            datetime: session.datetime
        };

        eventsData.push(newEvent);

        const commitSha = await updateFileContent(
            EVENTS_FILE_PATH,
            eventsData,
            sha,
            `Add event: ${formatDateTime(session.datetime)} at ${session.locationName}`
        );

        const message = await ctx.editMessageText(
            `✅ Added new event!\n\n**${formatDateTime(session.datetime)}**\n📍 ${session.locationName}\n\n🔄 Deploying to website...`,
            { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } // Remove the buttons
            }
        );

        if (deploymentPoller) {
            deploymentPoller.addPendingDeployment(
                ctx.from.id,
                ctx.chat.id,
                message.message_id,
                commitSha
            );
        }

        sessionManager.delete(ctx.from.id);
    });

    bot.callbackQuery('noop', async (ctx) => {
        await ctx.answerCallbackQuery();
    });
}

export async function handleEventsTextInput(ctx, deploymentPoller = null) {
    const session = sessionManager.get(ctx.from.id);

    try {
        if (session.action === 'add_about') {
            // User is adding an about text
            const aboutText = ctx.message.text.trim();
            
            // Add the event with the about text
            const { data: eventsData, sha } = await getFileContent(EVENTS_FILE_PATH);

            const newEvent = {
                locationId: session.locationId,
                datetime: session.datetime
            };

            // Add about field only if provided
            if (aboutText) {
                newEvent.about = aboutText;
            }

            eventsData.push(newEvent);

            const commitSha = await updateFileContent(
                EVENTS_FILE_PATH,
                eventsData,
                sha,
                `Add event: ${formatDateTime(session.datetime)} at ${session.locationName}`
            );

            const aboutTextDisplay = aboutText ? `\n\n📝 *About:*\n${aboutText}` : '';
            
            const message = await ctx.reply(
                `✅ Added new event!\n\n**${formatDateTime(session.datetime)}**\n📍 ${session.locationName}${aboutTextDisplay}\n\n🔄 Deploying to website...`,
                { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                }
            );

            if (deploymentPoller) {
                deploymentPoller.addPendingDeployment(
                    ctx.from.id,
                    ctx.chat.id,
                    message.message_id,
                    commitSha
                );
            }

            sessionManager.delete(ctx.from.id);
        } else if (session.action === 'add_datetime') {
            const dateTimeString = ctx.message.text.trim();

            if (!isValidDateTime(dateTimeString)) {
                await ctx.reply('❌ Invalid date/time format. Please use YYYY-MM-DDTHH:MM:SS format.\n\nExample: 2025-09-06T18:00:00');
                return;
            }

            // Check if this exact event already exists
            const { data: events } = await getFileContent(EVENTS_FILE_PATH);
            const existingEvent = events.find(event =>
                event.locationId === session.locationId &&
                event.datetime === dateTimeString
            );

            if (existingEvent) {
                await ctx.reply(`❌ An event already exists at this location and time. Please choose a different date/time.`);
                return;
            }

            // Store the datetime and ask for optional about text
            session.action = 'add_about';
            session.datetime = dateTimeString;
            sessionManager.set(ctx.from.id, session);

            const keyboard = new InlineKeyboard()
                .text('Skip', 'events_skip_about')
                .text('Cancel', 'cancel');

            await ctx.reply(
                `Great! The event is scheduled for **${formatDateTime(dateTimeString)}** at **${session.locationName}**\n\nWould you like to add an optional description? (You can include basic text formatting like *bold* or _italic_)`,
                { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard 
                }
            );

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
