import { config } from '../config/config.js';

export class TelegramLogger {
    constructor() {
        this.botToken = config.TELEGRAM_BOT_TOKEN;
        this.channelId = config.TELEGRAM_LOG_CHANNEL_ID;
    }

    async log(action, details, userId = 'system', userName = 'Event Scheduler') {
        if (!this.botToken || !this.channelId) {
            console.log('Telegram Logger (not configured):', { action, details, userId, userName });
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const userInfo = userName ? `${userName} (${userId})` : `User ${userId}`;

            let message = `🔍 **Log**\n\n`;
            message += `**Action:** ${action}\n`;
            message += `**User:** ${userInfo}\n`;
            message += `**Time:** ${timestamp}\n`;

            if (details) {
                message += `**Details:**\n${details}`;
            }

            await this.sendMessage(message);
        } catch (error) {
            console.error('Error sending log to Telegram:', error);
        }
    }

    async logError(error, title = 'Error', userId = 'system', userName = 'Event Scheduler') {
        if (!this.botToken || !this.channelId) {
            console.error('Telegram Logger (not configured):', { title, error: error.message, userId, userName });
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const userInfo = userName ? `${userName} (${userId})` : `User ${userId}`;

            let message = `❌ **Error Log**\n\n`;
            message += `**Title:** ${title}\n`;
            message += `**User:** ${userInfo}\n`;
            message += `**Time:** ${timestamp}\n`;
            message += `**Error:** ${error.message || String(error)}\n`;

            if (error.stack) {
                // Truncate stack trace if too long (Telegram has message limits)
                const stackTrace = error.stack.length > 1000 
                    ? error.stack.substring(0, 1000) + '... (truncated)'
                    : error.stack;
                message += `\n**Stack Trace:**\n\`\`\`\n${stackTrace}\n\`\`\``;
            }

            await this.sendMessage(message);
        } catch (sendError) {
            console.error('Error sending error log to Telegram:', sendError);
            console.error('Original error:', error);
        }
    }

    async sendMessage(text) {
        if (!this.botToken || !this.channelId) {
            return;
        }

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: this.channelId,
                text: text,
                parse_mode: 'Markdown'
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Telegram API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        return await response.json();
    }
}

