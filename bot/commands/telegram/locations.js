import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const FILE_PATH = 'data/locations.json';
const ITEMS_PER_PAGE = 10;

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

export function registerLocationsCommands(bot, deploymentPoller = null) {
    // Main locations command
    bot.command('locations', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('Add Location', 'locations_add')
            .text('Remove Location', 'locations_remove')
            .row()
            .text('View All', 'locations_view');

        await ctx.reply('What would you like to do with locations?', {
            reply_markup: keyboard
        });
    });

    // View all locations
    bot.callbackQuery('locations_view', async (ctx) => {
        try {
            const { data: locations } = await getFileContent(FILE_PATH);

            if (locations.length === 0) {
                await ctx.editMessageText('No locations found.');
                return;
            }

            let message = '**All Locations:**\n\n';
            locations.forEach((location, index) => {
                message += `**${index + 1}. ${location.location}**\n`;
                message += `📍 ${location.venue}\n`;
                message += `🆔 ID: \`${location.id}\`\n`;
                message += `📍 Coordinates: ${location.lat}, ${location.lng}\n\n`;
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add location flow
    bot.callbackQuery('locations_add', async (ctx) => {
        sessionManager.set(ctx.from.id, {
            command: 'locations',
            action: 'add_location_name'
        });
        await ctx.editMessageText('Please enter the location name (e.g., "ALTRINCHAM"):');
    });

    // Remove location flow - show locations with pagination
    bot.callbackQuery('locations_remove', async (ctx) => {
        await showLocationRemovalSelection(ctx, 0);
    });

    // Handle location pagination for remove location
    bot.callbackQuery(/^locations_remove_page_(\d+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await showLocationRemovalSelection(ctx, page);
    });

    async function showLocationRemovalSelection(ctx, page) {
        try {
            const { data: locations } = await getFileContent(FILE_PATH);

            if (locations.length === 0) {
                await ctx.editMessageText('No locations to remove.');
                return;
            }

            const keyboard = createPaginatedKeyboard(
                locations,
                page,
                ITEMS_PER_PAGE,
                'locations_remove',
                (location, index) => `${location.location} - ${location.venue}`
            );

            await ctx.editMessageText('Select a location to remove:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    }

    // Handle remove location selection
    bot.callbackQuery(/^locations_remove_(\d+)$/, async (ctx) => {
        try {
            const locationIndex = parseInt(ctx.match[1]);
            const { data: locations, sha } = await getFileContent(FILE_PATH);

            const removedLocation = locations.splice(locationIndex, 1)[0];

            const commitSha = await updateFileContent(
                FILE_PATH,
                locations,
                sha,
                `Remove location: ${removedLocation.location} - ${removedLocation.venue}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed location: **${removedLocation.location} - ${removedLocation.venue}**\n\n🔄 Deploying to website...`,
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

export async function handleLocationsTextInput(ctx, deploymentPoller = null) {
    const session = sessionManager.get(ctx.from.id);

    try {
        if (session.action === 'add_location_name') {
            const location = ctx.message.text.trim().toUpperCase();
            session.location = location;
            session.action = 'add_venue_name';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply(`Great! Now enter the venue name for ${location} (e.g., "CRESTA COURT HOTEL"):`);

        } else if (session.action === 'add_venue_name') {
            const venue = ctx.message.text.trim().toUpperCase();
            const id = generateId(session.location, venue);

            // Check if ID already exists
            const { data: locations } = await getFileContent(FILE_PATH);
            const existingLocation = locations.find(loc => loc.id === id);

            if (existingLocation) {
                await ctx.reply(`❌ A location with this combination already exists (ID: ${id}). Please choose a different location or venue name:`);
                return;
            }

            session.venue = venue;
            session.id = id;
            session.action = 'add_latitude';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply(`Perfect! Generated ID: \`${id}\`\n\nNow enter the latitude (e.g., 53.3881):`);

        } else if (session.action === 'add_latitude') {
            const lat = ctx.message.text.trim();
            const latitude = parseFloat(lat);

            if (isNaN(latitude) || latitude < -90 || latitude > 90) {
                await ctx.reply('❌ Invalid latitude. Please enter a valid latitude between -90 and 90:');
                return;
            }

            session.lat = latitude;
            session.action = 'add_longitude';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply('Perfect! Now enter the longitude (e.g., -2.3477):');

        } else if (session.action === 'add_longitude') {
            const lng = ctx.message.text.trim();
            const longitude = parseFloat(lng);

            if (isNaN(longitude) || longitude < -180 || longitude > 180) {
                await ctx.reply('❌ Invalid longitude. Please enter a valid longitude between -180 and 180:');
                return;
            }

            if (!isValidCoordinate(session.lat, longitude)) {
                await ctx.reply('❌ Invalid coordinates. Please check your latitude and longitude values.');
                return;
            }

            // Add the new location
            const { data: locations, sha } = await getFileContent(FILE_PATH);

            const newLocation = {
                id: session.id,
                location: session.location,
                venue: session.venue,
                lat: session.lat,
                lng: longitude
            };

            locations.push(newLocation);

            const commitSha = await updateFileContent(
                FILE_PATH,
                locations,
                sha,
                `Add location: ${session.location} - ${session.venue}`
            );

            const message = await ctx.reply(
                `✅ Added new location:\n\n**${session.location}**\n📍 ${session.venue}\n🆔 ID: \`${session.id}\`\n📍 Coordinates: ${session.lat}, ${longitude}\n\n🔄 Deploying to website...`,
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
