import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../utils/github.js';
import { sessionManager } from '../utils/sessions.js';

const REPEATING_EVENTS_FILE_PATH = 'data/repeating-events.json';
const LOCATIONS_FILE_PATH = 'data/locations.json';

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

// Validate time format (HH:MM:SS)
function isValidTime(timeString) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    return timeRegex.test(timeString);
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
                message += `🔄 ${status}\n\n`;
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

            const keyboard = new InlineKeyboard();
            locations.forEach((location, index) => {
                keyboard.text(`${location.location} - ${location.venue}`, `schedule_add_location_${index}`).row();
            });
            keyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select a location for the repeating event:', {
                reply_markup: keyboard
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
            const selectedLocation = locations[locationIndex];

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

    // Remove repeating event
    bot.callbackQuery('schedule_remove', async (ctx) => {
        try {
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (repeatingEvents.length === 0) {
                await ctx.editMessageText('No repeating events to remove.');
                return;
            }

            const keyboard = new InlineKeyboard();
            repeatingEvents.forEach((event, index) => {
                keyboard.text(`${event.name}`, `schedule_remove_${index}`).row();
            });
            keyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select a repeating event to remove:', {
                reply_markup: keyboard
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

            const removedEvent = repeatingEvents.splice(eventIndex, 1)[0];

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

            const keyboard = new InlineKeyboard();
            repeatingEvents.forEach((event, index) => {
                const status = event.enabled ? '✅' : '❌';
                keyboard.text(`${status} ${event.name}`, `schedule_toggle_${index}`).row();
            });
            keyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select a repeating event to enable/disable:', {
                reply_markup: keyboard
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

            repeatingEvents[eventIndex].enabled = !repeatingEvents[eventIndex].enabled;
            const event = repeatingEvents[eventIndex];
            const status = event.enabled ? 'enabled' : 'disabled';

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
