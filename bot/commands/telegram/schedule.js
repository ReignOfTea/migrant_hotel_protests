import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const REPEATING_EVENTS_FILE_PATH = 'data/repeating-events.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';
const MAX_BUTTONS_PER_PAGE = 8; // Telegram inline keyboard limit consideration

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

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

// Validate date format (YYYY-MM-DD)
function isValidDate(dateString) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && date.toISOString().slice(0, 10) === dateString;
}

// Create paginated location keyboard
function createLocationKeyboard(locations, page = 0) {
    const chunks = chunkArray(locations, MAX_BUTTONS_PER_PAGE);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    const keyboard = new InlineKeyboard();

    currentChunk.forEach((location, index) => {
        const originalIndex = page * MAX_BUTTONS_PER_PAGE + index;
        keyboard.text(`${location.location} - ${location.venue}`, `schedule_add_location_${originalIndex}`).row();
    });

    // Add navigation buttons
    if (totalPages > 1) {
        const navRow = [];
        if (page > 0) {
            navRow.push({ text: '◀ Previous', callback_data: `schedule_add_location_page_${page - 1}` });
        }
        navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
        if (page < totalPages - 1) {
            navRow.push({ text: 'Next ▶', callback_data: `schedule_add_location_page_${page + 1}` });
        }
        keyboard.row(...navRow.map(btn => InlineKeyboard.text(btn.text, btn.callback_data)));
    }

    keyboard.text('Cancel', 'cancel');
    return keyboard;
}

// Create paginated repeating events keyboard
function createRepeatingEventsKeyboard(events, action, page = 0) {
    const chunks = chunkArray(events, MAX_BUTTONS_PER_PAGE);
    const currentChunk = chunks[page];
    const totalPages = chunks.length;

    const keyboard = new InlineKeyboard();

    currentChunk.forEach((event, index) => {
        const originalIndex = page * MAX_BUTTONS_PER_PAGE + index;
        let buttonText = event.name;

        if (action === 'toggle') {
            const status = event.enabled ? '✅' : '❌';
            buttonText = `${status} ${event.name}`;
        } else if (action === 'unexclude') {
            const excludedCount = event.excludedDates?.length || 0;
            buttonText = `📅 ${event.name} (${excludedCount} excluded)`;
        }

        keyboard.text(buttonText, `schedule_${action}_${originalIndex}`).row();
    });

    // Add navigation buttons
    if (totalPages > 1) {
        const navRow = [];
        if (page > 0) {
            navRow.push({ text: '◀ Previous', callback_data: `schedule_${action}_page_${page - 1}` });
        }
        navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
        if (page < totalPages - 1) {
            navRow.push({ text: 'Next ▶', callback_data: `schedule_${action}_page_${page + 1}` });
        }
        keyboard.row(...navRow.map(btn => InlineKeyboard.text(btn.text, btn.callback_data)));
    }

    keyboard.text('Cancel', 'cancel');
    return keyboard;
}

export function registerScheduleCommands(bot, deploymentPoller = null, scheduler = null) {
    // Main schedule command
    bot.command('schedule', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('Add Repeating Event', 'schedule_add')
            .text('Remove Repeating Event', 'schedule_remove')
            .row()
            .text('View All', 'schedule_view')
            .text('Toggle Event', 'schedule_toggle')
            .row()
            .text('Exclude Dates', 'schedule_exclude')
            .text('Remove Exclusions', 'schedule_unexclude')
            .row()
            .text('Manual Cleanup', 'schedule_cleanup')
            .text('Manual Repeating', 'schedule_repeating');

        await ctx.reply('**📅 Event Scheduler**\n\nWhat would you like to do?', {
            reply_markup: keyboard,
            parse_mode: 'Markdown'
        });
    });

    // View all repeating events
    bot.callbackQuery('schedule_view', async (ctx) => {
        try {
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            if (repeatingEvents.length === 0) {
                await ctx.editMessageText('No repeating events configured.');
                return;
            }

            let message = '**📅 Repeating Events:**\n\n';
            repeatingEvents.forEach((event, index) => {
                const location = locations.find(loc => loc.id === event.locationId);
                const locationName = location ? `${location.location} - ${location.venue}` : event.locationId;
                const status = event.enabled ? '✅ Enabled' : '❌ Disabled';

                message += `**${index + 1}. ${event.name}**\n`;
                message += `📍 ${locationName}\n`;
                message += `📅 Every ${WEEKDAYS[event.weekday]} at ${event.time}\n`;
                message += `🔄 ${status}\n`;

                if (event.excludedDates && event.excludedDates.length > 0) {
                    const sortedExcluded = [...event.excludedDates].sort();
                    message += `🚫 Excluded: ${sortedExcluded.join(', ')}\n`;
                }
                message += '\n';
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add repeating event
    bot.callbackQuery('schedule_add', async (ctx) => {
        try {
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            if (locations.length === 0) {
                await ctx.editMessageText('No locations available. Please add locations first using /locations.');
                return;
            }

            // Sort locations alphabetically for better UX
            const sortedLocations = locations
                .map((location, originalIndex) => ({ ...location, originalIndex }))
                .sort((a, b) => a.location.localeCompare(b.location));

            const keyboard = createLocationKeyboard(sortedLocations, 0);

            await ctx.editMessageText('**📅 Add Repeating Event**\n\nSelect a location for the repeating event (Page 1):', {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Exclude dates from repeating event
    bot.callbackQuery('schedule_exclude', async (ctx) => {
        try {
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (repeatingEvents.length === 0) {
                await ctx.editMessageText('No repeating events to exclude dates from.');
                return;
            }

            // Sort events by name for better UX
            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'exclude', 0);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**🚫 Exclude Dates**\n\nSelect a repeating event to exclude dates from (Page 1 of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Remove excluded dates from repeating event
    bot.callbackQuery('schedule_unexclude', async (ctx) => {
        try {
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (repeatingEvents.length === 0) {
                await ctx.editMessageText('No repeating events found.');
                return;
            }

            const eventsWithExclusions = repeatingEvents.filter(event =>
                event.excludedDates && Array.isArray(event.excludedDates) && event.excludedDates.length > 0
            );

            if (eventsWithExclusions.length === 0) {
                await ctx.editMessageText('No repeating events with excluded dates found.');
                return;
            }

            // Sort events by name for better UX
            const sortedEvents = eventsWithExclusions
                .map(event => {
                    const originalIndex = repeatingEvents.findIndex(e => e === event);
                    return { ...event, originalIndex };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'unexclude', 0);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**📅 Remove Excluded Dates**\n\nSelect a repeating event to remove excluded dates from (Page 1 of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle location pagination
    bot.callbackQuery(/^schedule_add_location_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            const sortedLocations = locations
                .map((location, originalIndex) => ({ ...location, originalIndex }))
                .sort((a, b) => a.location.localeCompare(b.location));

            const keyboard = createLocationKeyboard(sortedLocations, page);
            const totalPages = Math.ceil(sortedLocations.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**📅 Add Repeating Event**\n\nSelect a location for the repeating event (Page ${page + 1} of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle location selection for new repeating event
    bot.callbackQuery(/^schedule_add_location_(\d+)$/, async (ctx) => {
        try {
            const locationIndex = parseInt(ctx.match[1]);
            const { data: locations } = await getFileContent(LOCATIONS_FILE_PATH);

            // Get original location from sorted array
            const sortedLocations = locations
                .map((location, originalIndex) => ({ ...location, originalIndex }))
                .sort((a, b) => a.location.localeCompare(b.location));

            const selectedLocation = locations[sortedLocations[locationIndex].originalIndex];

            sessionManager.set(ctx.from.id, {
                command: 'schedule',
                action: 'add_name',
                locationId: selectedLocation.id,
                locationName: `${selectedLocation.location} - ${selectedLocation.venue}`
            });

            await ctx.editMessageText(
                `Selected location: **${selectedLocation.location} - ${selectedLocation.venue}**\n\nNow enter a name for this repeating event:`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle exclude event selection
    bot.callbackQuery(/^schedule_exclude_(\d+)$/, async (ctx) => {
        try {
            const eventIndex = parseInt(ctx.match[1]);
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            // Get original event from sorted array
            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const originalIndex = sortedEvents[eventIndex].originalIndex;
            const event = repeatingEvents[originalIndex];

            sessionManager.set(ctx.from.id, {
                command: 'schedule',
                action: 'exclude_dates',
                eventIndex: originalIndex,
                eventName: event.name
            });

            await ctx.editMessageText(
                `Selected event: **${event.name}**\n\nEnter dates to exclude in YYYY-MM-DD format, separated by commas or spaces:\n\nExample: 2025-12-25, 2025-12-26, 2026-01-01`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle unexclude event selection
    bot.callbackQuery(/^schedule_unexclude_(\d+)$/, async (ctx) => {
        try {
            const eventIndex = parseInt(ctx.match[1]);
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            // Get original event from sorted array
            const eventsWithExclusions = repeatingEvents.filter(event =>
                event.excludedDates && Array.isArray(event.excludedDates) && event.excludedDates.length > 0
            );

            const sortedEvents = eventsWithExclusions
                .map(event => {
                    const originalIndex = repeatingEvents.findIndex(e => e === event);
                    return { ...event, originalIndex };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            const originalIndex = sortedEvents[eventIndex].originalIndex;
            const event = repeatingEvents[originalIndex];

            if (!event.excludedDates || event.excludedDates.length === 0) {
                await ctx.editMessageText('This event has no excluded dates.');
                return;
            }

            sessionManager.set(ctx.from.id, {
                command: 'schedule',
                action: 'unexclude_dates',
                eventIndex: originalIndex,
                eventName: event.name
            });

            const currentExcluded = event.excludedDates.sort().join(', ');

            await ctx.editMessageText(
                `Selected event: **${event.name}**\n\nCurrent excluded dates: ${currentExcluded}\n\nEnter specific dates to remove (YYYY-MM-DD format, separated by commas) or type "all" to remove all excluded dates:`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle exclude pagination
    bot.callbackQuery(/^schedule_exclude_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'exclude', page);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**🚫 Exclude Dates**\n\nSelect a repeating event to exclude dates from (Page ${page + 1} of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle unexclude pagination
    bot.callbackQuery(/^schedule_unexclude_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            const eventsWithExclusions = repeatingEvents.filter(event =>
                event.excludedDates && Array.isArray(event.excludedDates) && event.excludedDates.length > 0
            );

            const sortedEvents = eventsWithExclusions
                .map(event => {
                    const originalIndex = repeatingEvents.findIndex(e => e === event);
                    return { ...event, originalIndex };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'unexclude', page);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**📅 Remove Excluded Dates**\n\nSelect a repeating event to remove excluded dates from (Page ${page + 1} of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Remove repeating event
    bot.callbackQuery('schedule_remove', async (ctx) => {
        try {
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (repeatingEvents.length === 0) {
                await ctx.editMessageText('No repeating events to remove.');
                return;
            }

            // Sort events by name for better UX
            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'remove', 0);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**🗑️ Remove Repeating Event**\n\nSelect a repeating event to remove (Page 1 of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle remove event pagination
    bot.callbackQuery(/^schedule_remove_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'remove', page);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**🗑️ Remove Repeating Event**\n\nSelect a repeating event to remove (Page ${page + 1} of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle remove repeating event
    bot.callbackQuery(/^schedule_remove_(\d+)$/, async (ctx) => {
        try {
            const eventIndex = parseInt(ctx.match[1]);
            const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            // Get original event from sorted array
            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const originalIndex = sortedEvents[eventIndex].originalIndex;
            const removedEvent = repeatingEvents.splice(originalIndex, 1)[0];

            const commitSha = await updateFileContent(
                REPEATING_EVENTS_FILE_PATH,
                repeatingEvents,
                sha,
                `Remove repeating event: ${removedEvent.name}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed repeating event: **${removedEvent.name}**\n\n🔄 Deploying to website...`,
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

    // Toggle repeating event
    bot.callbackQuery('schedule_toggle', async (ctx) => {
        try {
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (repeatingEvents.length === 0) {
                await ctx.editMessageText('No repeating events to toggle.');
                return;
            }

            // Sort events by name for better UX
            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'toggle', 0);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**🔄 Toggle Repeating Event**\n\nSelect a repeating event to enable/disable (Page 1 of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle toggle event pagination
    bot.callbackQuery(/^schedule_toggle_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const keyboard = createRepeatingEventsKeyboard(sortedEvents, 'toggle', page);
            const totalPages = Math.ceil(sortedEvents.length / MAX_BUTTONS_PER_PAGE);

            await ctx.editMessageText(`**🔄 Toggle Repeating Event**\n\nSelect a repeating event to enable/disable (Page ${page + 1} of ${totalPages}):`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle toggle repeating event
    bot.callbackQuery(/^schedule_toggle_(\d+)$/, async (ctx) => {
        try {
            const eventIndex = parseInt(ctx.match[1]);
            const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            // Get original event from sorted array
            const sortedEvents = repeatingEvents
                .map((event, originalIndex) => ({ ...event, originalIndex }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const originalIndex = sortedEvents[eventIndex].originalIndex;
            repeatingEvents[originalIndex].enabled = !repeatingEvents[originalIndex].enabled;
            const event = repeatingEvents[originalIndex];

            const commitSha = await updateFileContent(
                REPEATING_EVENTS_FILE_PATH,
                repeatingEvents,
                sha,
                `${event.enabled ? 'Enable' : 'Disable'} repeating event: ${event.name}`
            );

            const message = await ctx.editMessageText(
                `✅ ${event.enabled ? 'Enabled' : 'Disabled'} repeating event: **${event.name}**\n\n🔄 Deploying to website...`,
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

    // Manual cleanup trigger
    bot.callbackQuery('schedule_cleanup', async (ctx) => {
        if (scheduler) {
            await ctx.editMessageText('🧹 Triggering manual event cleanup...');
            await scheduler.triggerCleanup();
            await ctx.editMessageText('✅ Manual event cleanup completed!');
        } else {
            await ctx.editMessageText('❌ Scheduler not available.');
        }
    });

    // Manual repeating events trigger
    bot.callbackQuery('schedule_repeating', async (ctx) => {
        if (scheduler) {
            await ctx.editMessageText('🔄 Triggering manual repeating events check...');
            await scheduler.triggerRepeatingEvents();
            await ctx.editMessageText('✅ Manual repeating events check completed!');
        } else {
            await ctx.editMessageText('❌ Scheduler not available.');
        }
    });

    // No-op callback for page indicators
    bot.callbackQuery('noop', async (ctx) => {
        await ctx.answerCallbackQuery();
    });
}

export async function handleScheduleTextInput(ctx, deploymentPoller = null) {
    const session = sessionManager.get(ctx.from.id);

    try {
        if (session.action === 'add_name') {
            const name = ctx.message.text.trim();
            session.name = name;
            session.action = 'add_weekday';
            sessionManager.set(ctx.from.id, session);

            const keyboard = new InlineKeyboard();
            WEEKDAYS.forEach((day, index) => {
                keyboard.text(day, `schedule_weekday_${index}`).row();
            });

            await ctx.reply(`Great! Now select the weekday for "${name}":`, {
                reply_markup: keyboard
            });

        } else if (session.action === 'add_time') {
            const time = ctx.message.text.trim();

            if (!isValidTime(time)) {
                await ctx.reply('❌ Invalid time format. Please use HH:MM:SS format (e.g., 18:00:00):');
                return;
            }

            // Add the new repeating event
            const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            const newEvent = {
                name: session.name,
                locationId: session.locationId,
                weekday: session.weekday,
                time: time,
                enabled: true,
                created: new Date().toISOString()
            };

            repeatingEvents.push(newEvent);

            const commitSha = await updateFileContent(
                REPEATING_EVENTS_FILE_PATH,
                repeatingEvents,
                sha,
                `Add repeating event: ${session.name} - ${WEEKDAYS[session.weekday]} ${time}`
            );

            const message = await ctx.reply(
                `✅ Added repeating event:\n\n**${session.name}**\n📍 ${session.locationName}\n📅 Every ${WEEKDAYS[session.weekday]} at ${time}\n\n🔄 Deploying to website...`,
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

            sessionManager.delete(ctx.from.id);

        } else if (session.action === 'exclude_dates') {
            const datesInput = ctx.message.text.trim();

            // Parse and validate dates
            const dateStrings = datesInput.split(/[,\s]+/).filter(d => d.length > 0);
            const validDates = [];
            const invalidDates = [];

            for (const dateStr of dateStrings) {
                if (isValidDate(dateStr)) {
                    validDates.push(dateStr);
                } else {
                    invalidDates.push(dateStr);
                }
            }

            if (invalidDates.length > 0) {
                await ctx.reply(`❌ Invalid date format(s): ${invalidDates.join(', ')}\n\nPlease use YYYY-MM-DD format (e.g., 2025-12-25)`);
                return;
            }

            if (validDates.length === 0) {
                await ctx.reply('❌ No valid dates provided.');
                return;
            }

            const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
            const event = repeatingEvents[session.eventIndex];

            if (!event) {
                await ctx.reply('❌ Event not found.');
                sessionManager.delete(ctx.from.id);
                return;
            }

            // Initialize excludedDates if it doesn't exist
            if (!event.excludedDates) {
                event.excludedDates = [];
            }

            // Add new dates, avoiding duplicates
            const newDates = validDates.filter(date => !event.excludedDates.includes(date));
            event.excludedDates.push(...newDates);
            event.excludedDates.sort();

            const commitSha = await updateFileContent(
                REPEATING_EVENTS_FILE_PATH,
                repeatingEvents,
                sha,
                `Add excluded dates to "${event.name}": ${newDates.join(', ')}`
            );

            const message = await ctx.reply(
                `✅ **Excluded Dates Added!**\n\n**Event:** ${event.name}\n**Added Dates:** ${newDates.join(', ')}\n**Total Excluded:** ${event.excludedDates.length}\n\n🔄 Deploying to website...`,
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

            sessionManager.delete(ctx.from.id);

        } else if (session.action === 'unexclude_dates') {
            const datesInput = ctx.message.text.trim();

            const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
            const event = repeatingEvents[session.eventIndex];

            if (!event || !event.excludedDates) {
                await ctx.reply('❌ Event not found or has no excluded dates.');
                sessionManager.delete(ctx.from.id);
                return;
            }

            if (datesInput.toLowerCase() === 'all') {
                // Remove all excluded dates
                const removedCount = event.excludedDates.length;
                event.excludedDates = [];

                const commitSha = await updateFileContent(
                    REPEATING_EVENTS_FILE_PATH,
                    repeatingEvents,
                    sha,
                    `Remove all excluded dates from "${event.name}"`
                );

                const message = await ctx.reply(
                    `✅ **All Excluded Dates Removed!**\n\n**Event:** ${event.name}\n**Removed:** ${removedCount} dates\n\n🔄 Deploying to website...`,
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

            } else {
                // Parse specific dates to remove
                const dateStrings = datesInput.split(/[,\s]+/).filter(d => d.length > 0);
                const removedDates = [];
                const notFoundDates = [];

                for (const dateStr of dateStrings) {
                    const index = event.excludedDates.indexOf(dateStr);
                    if (index > -1) {
                        event.excludedDates.splice(index, 1);
                        removedDates.push(dateStr);
                    } else {
                        notFoundDates.push(dateStr);
                    }
                }

                if (removedDates.length === 0) {
                    await ctx.reply(`❌ None of the specified dates were found in the excluded list.\n\nCurrent excluded dates: ${event.excludedDates.join(', ') || 'None'}`);
                    return;
                }

                const commitSha = await updateFileContent(
                    REPEATING_EVENTS_FILE_PATH,
                    repeatingEvents,
                    sha,
                    `Remove excluded dates from "${event.name}": ${removedDates.join(', ')}`
                );

                let responseMessage = `✅ **Excluded Dates Removed!**\n\n**Event:** ${event.name}\n**Removed Dates:** ${removedDates.join(', ')}\n**Remaining Excluded:** ${event.excludedDates.length}`;

                if (notFoundDates.length > 0) {
                    responseMessage += `\n**Not Found:** ${notFoundDates.join(', ')}`;
                }

                responseMessage += '\n\n🔄 Deploying to website...';

                const message = await ctx.reply(responseMessage, { parse_mode: 'Markdown' });

                if (deploymentPoller) {
                    deploymentPoller.addPendingDeployment(
                        ctx.from.id,
                        ctx.chat.id,
                        message.message_id,
                        commitSha
                    );
                }
            }

            sessionManager.delete(ctx.from.id);
        }
    } catch (error) {
        await ctx.reply(`Error: ${error.message}`);
        sessionManager.delete(ctx.from.id);
    }
}

// Handle weekday selection
export function registerScheduleCallbacks(bot) {
    bot.callbackQuery(/^schedule_weekday_(\d+)$/, async (ctx) => {
        const weekdayIndex = parseInt(ctx.match[1]);
        const session = sessionManager.get(ctx.from.id);

        if (!session) {
            await ctx.editMessageText('❌ Session expired. Please try again.');
            return;
        }

        session.weekday = weekdayIndex;
        session.action = 'add_time';
        sessionManager.set(ctx.from.id, session);

        await ctx.editMessageText(
            `Selected: **${WEEKDAYS[weekdayIndex]}**\n\nNow enter the time in HH:MM:SS format (e.g., 18:00:00):`,
            { parse_mode: 'Markdown' }
        );
    });
}
