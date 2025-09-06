import { config } from '../config/config.js';

export const authMiddleware = async (ctx, next) => {
    // Allow start and help commands for everyone to see the bot is working
    if (ctx.message?.text === '/start' || ctx.message?.text === '/help') {
        return next();
    }

    // Skip auth for updates without user context (like channel posts)
    if (!ctx.from) {
        console.log('Skipping auth for update without user context');
        return;
    }

    // For all other interactions, check authorization
    const userId = ctx.from.id;
    const chatId = ctx.chat?.id;
    const chatType = ctx.chat?.type;

    // Handle case where ALLOWED_USERS is not set or empty
    if (!config.ALLOWED_USERS || config.ALLOWED_USERS.trim() === '') {
        console.warn('ALLOWED_USERS not configured - denying access');
        await ctx.reply('❌ Bot is not configured properly. Please contact the administrator.');
        return;
    }

    const allowedUsers = config.ALLOWED_USERS.split(',').map(id => parseInt(id.trim()));

    // Check allowed chats if configured
    let allowedChats = [];
    if (config.ALLOWED_CHATS && config.ALLOWED_CHATS.trim() !== '') {
        allowedChats = config.ALLOWED_CHATS.split(',').map(id => parseInt(id.trim()));
    }

    // Check authorization
    const userAuthorized = allowedUsers.includes(userId);
    const chatAuthorized = allowedChats.length === 0 || allowedChats.includes(chatId);

    if (!userAuthorized) {
        console.log(`Unauthorized access attempt by user ${userId} in ${chatType} chat ${chatId}`);

        // In groups/channels, be more discrete
        if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
            return; // Just ignore
        } else {
            await ctx.reply('❌ You are not authorized to use this bot.');
            return;
        }
    }

    // If we have allowed chats configured, check if this chat is allowed
    if (allowedChats.length > 0 && !chatAuthorized) {
        console.log(`Command from authorized user ${userId} but in unauthorized chat ${chatId}`);
        return; // Just ignore
    }

    return next();
};
