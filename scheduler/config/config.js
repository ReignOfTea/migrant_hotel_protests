export const config = {
    // Telegram Logger
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_LOG_CHANNEL_ID: process.env.TELEGRAM_LOG_CHANNEL_ID,

    // GitHub
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    REPO_OWNER: process.env.REPO_OWNER || 'ReignOfTea',
    REPO_NAME: process.env.REPO_NAME || 'hotels',

    // URLs
    WEBSITE_URL: process.env.WEBSITE_URL || 'https://reignoftea.github.io/hotels/',
    GITHUB_REPO_URL: process.env.GITHUB_REPO_URL || 'https://github.com/ReignOfTea/hotels',

    // Scheduler settings
    EVENT_CLEANUP_DAYS: parseInt(process.env.EVENT_CLEANUP_DAYS) || 7,
    REPEATING_EVENT_ADVANCE_WEEKS: parseInt(process.env.REPEATING_EVENT_ADVANCE_WEEKS) || 4
};