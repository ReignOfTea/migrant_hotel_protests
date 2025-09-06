import { Bot } from 'grammy';
import { AuditLogger } from './audit.js';
import { config } from '../config/config.js';

export class DiscordAuditLogger extends AuditLogger {
    constructor() {
        // Create a minimal Telegram bot instance just for audit logging
        const telegramBot = new Bot(config.BOT_TOKEN);
        super(telegramBot);
    }

    // Override log method to handle Discord user info
    async log(action, details, userId, userName, platform = 'Discord') {
        if (!this.channelId) {
            console.log(`Audit log (no channel configured) [${platform}]:`, { action, details, userId, userName });
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const userInfo = userName ? `${userName} (${userId})` : `User ${userId}`;

            let message = `🔍 **Audit Log** [${platform}]\n\n`;
            message += `**Action:** ${action}\n`;
            message += `**User:** ${userInfo}\n`;
            message += `**Time:** ${timestamp}\n`;

            if (details) {
                message += `**Details:** ${details}\n`;
            }

            await this.bot.api.sendMessage(this.channelId, message, {
                parse_mode: 'Markdown'
            });

            console.log(`Audit logged [${platform}]:`, { action, details, userId, userName });
        } catch (error) {
            console.error('Failed to send audit log:', error);
            console.log(`Audit log (failed to send) [${platform}]:`, { action, details, userId, userName });
        }
    }
}
