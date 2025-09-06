export const config = {
    // Telegram Bot
    BOT_TOKEN: process.env.BOT_TOKEN,
    ALLOWED_USERS: process.env.ALLOWED_USERS || '',
    ALLOWED_CHATS: process.env.ALLOWED_CHATS || '',

    // Discord Bot
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_ALLOWED_USERS: process.env.DISCORD_ALLOWED_USERS || '',
    DISCORD_ALLOWED_CHANNELS: process.env.DISCORD_ALLOWED_CHANNELS || '',

    // GitHub
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    REPO_OWNER: process.env.REPO_OWNER || 'ReignOfTea',
    REPO_NAME: process.env.REPO_NAME || 'hotels',

    // Audit logging (Telegram channel)
    AUDIT_CHANNEL_ID: process.env.AUDIT_CHANNEL_ID || null,

    // Polling settings
    POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 15000,
    MAX_POLL_TIME: parseInt(process.env.MAX_POLL_TIME) || 300000,

    // URLs
    WEBSITE_URL: process.env.WEBSITE_URL || 'https://reignoftea.github.io/hotels/',
    GITHUB_REPO_URL: process.env.GITHUB_REPO_URL || 'https://github.com/ReignOfTea/hotels',

    EVENT_CLEANUP_DAYS: parseInt(process.env.EVENT_CLEANUP_DAYS) || 7,
    REPEATING_EVENT_ADVANCE_WEEKS: parseInt(process.env.REPEATING_EVENT_ADVANCE_WEEKS) || 2
};