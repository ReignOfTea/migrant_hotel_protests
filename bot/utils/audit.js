import { config } from '../config/config.js';

export class AuditLogger {
    constructor(bot) {
        this.bot = bot;
        this.channelId = config.AUDIT_CHANNEL_ID;
    }

    async log(action, details, userId, userName) {
        if (!this.channelId) {
            console.log('Audit log (no channel configured):', { action, details, userId, userName });
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const userInfo = userName ? `${userName} (${userId})` : `User ${userId}`;

            let message = `🔍 **Audit Log**\n\n`;
            message += `**Action:** ${action}\n`;
            message += `**User:** ${userInfo}\n`;
            message += `**Time:** ${timestamp}\n`;

            if (details) {
                message += `**Details:** ${details}\n`;
            }

            await this.bot.api.sendMessage(this.channelId, message, {
                parse_mode: 'Markdown'
            });

            console.log('Audit logged:', { action, details, userId, userName });
        } catch (error) {
            console.error('Failed to send audit log:', error);
            // Still log to console as fallback
            console.log('Audit log (failed to send):', { action, details, userId, userName });
        }
    }

    // Specific audit methods for different actions
    async logSectionAdd(section, filePath, userId, userName) {
        await this.log(
            'Section Added',
            `Added "${section}" to ${filePath}`,
            userId,
            userName
        );
    }

    async logSectionRemove(section, filePath, userId, userName) {
        await this.log(
            'Section Removed',
            `Removed "${section}" from ${filePath}`,
            userId,
            userName
        );
    }

    async logLinkAdd(linkText, section, filePath, userId, userName) {
        await this.log(
            'Link Added',
            `Added link "${linkText}" to section "${section}" in ${filePath}`,
            userId,
            userName
        );
    }

    async logLinkRemove(linkText, section, filePath, userId, userName) {
        await this.log(
            'Link Removed',
            `Removed link "${linkText}" from section "${section}" in ${filePath}`,
            userId,
            userName
        );
    }

    async logLocationAdd(location, venue, userId, userName) {
        await this.log(
            'Location Added',
            `Added location "${location} - ${venue}"`,
            userId,
            userName
        );
    }

    async logLocationRemove(location, venue, userId, userName) {
        await this.log(
            'Location Removed',
            `Removed location "${location} - ${venue}"`,
            userId,
            userName
        );
    }

    async logEventAdd(datetime, locationName, userId, userName) {
        await this.log(
            'Event Added',
            `Added event on ${datetime} at ${locationName}`,
            userId,
            userName
        );
    }

    async logEventRemove(datetime, locationName, userId, userName) {
        await this.log(
            'Event Removed',
            `Removed event on ${datetime} at ${locationName}`,
            userId,
            userName
        );
    }

    async logDeployment(commitSha, message, userId, userName) {
        await this.log(
            'Deployment Started',
            `Commit: ${commitSha.substring(0, 7)} - ${message}`,
            userId,
            userName
        );
    }

    async logDeploymentComplete(commitSha, duration, userId) {
        if (!this.channelId) return;

        try {
            const message = `✅ **Deployment Complete**\n\n` +
                `**Commit:** ${commitSha.substring(0, 7)}\n` +
                `**Duration:** ${Math.round(duration / 1000)}s\n` +
                `**Website:** [View Live Site](${config.WEBSITE_URL})`;

            await this.bot.api.sendMessage(this.channelId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error('Failed to log deployment completion:', error);
        }
    }

    async logError(error, context, userId, userName) {
        await this.log(
            'Error Occurred',
            `${context}: ${error.message}`,
            userId,
            userName
        );
    }
}
