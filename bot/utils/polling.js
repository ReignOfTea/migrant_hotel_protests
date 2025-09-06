import { config } from '../config/config.js';

export class DeploymentPoller {
    constructor(telegramBot = null, auditLogger = null, discordClient = null) {
        this.telegramBot = telegramBot;
        this.discordClient = discordClient;
        this.auditLogger = auditLogger;
        this.pendingDeployments = new Map();
        this.pollInterval = config.POLL_INTERVAL;
        this.maxPollTime = config.MAX_POLL_TIME;
        this.isPolling = false;
    }

    addPendingDeployment(userId, chatId, messageIdOrInteraction, commitSha, userName = null, platform = 'telegram') {
        console.log(`Adding pending deployment for polling: ${commitSha}`);
        this.pendingDeployments.set(commitSha, {
            userId,
            chatId,
            messageIdOrInteraction, // This will be messageId for Telegram, interaction for Discord
            startTime: Date.now(),
            lastCheck: null,
            userName,
            platform
        });

        this.startPollingIfNeeded();
    }

    async sendSuccessMessage(deployment, elapsed) {
        if (deployment.platform === 'telegram' && this.telegramBot) {
            const successMessage = `✅ **Deployment Complete!**\n\nYour changes are now live on the website.\n\n🔗 [View Website](${config.WEBSITE_URL})\n\n_Deployment took ${Math.round(elapsed / 1000)} seconds_`;

            await this.telegramBot.api.sendMessage(
                deployment.chatId,
                successMessage,
                {
                    parse_mode: 'Markdown',
                    reply_to_message_id: deployment.messageId,
                    disable_web_page_preview: true
                }
            );
        } else if (deployment.platform === 'discord' && this.discordClient) {
            console.log(`Updating Discord interaction for user ${deployment.userId}`);
            try {
                // For Discord, we need to edit the original interaction response
                const channel = await this.discordClient.channels.fetch(deployment.chatId);
                if (channel) {
                    // Try to fetch and edit the original interaction response
                    const webhook = await this.discordClient.fetchWebhook(this.discordClient.user.id);

                    const successMessage = `✅ **Deployment Complete!**\n\nYour changes are now live on the website.\n\n🔗 [View Website](${config.WEBSITE_URL})\n\n_Deployment took ${Math.round(elapsed / 1000)} seconds_`;

                    // Since we can't directly edit the ephemeral response from here,
                    // let's send a follow-up message instead
                    await channel.send({
                        content: `${successMessage} <@${deployment.userId}>`,
                        allowedMentions: { users: [deployment.userId] }
                    });

                    console.log('Discord success message sent successfully');
                } else {
                    console.error(`Discord channel ${deployment.chatId} not found`);
                }
            } catch (error) {
                console.error('Error sending Discord success message:', error);
            }
        }
    }

    async sendTimeoutMessage(deployment, elapsed) {
        if (deployment.platform === 'telegram' && this.telegramBot) {
            const timeoutMessage = `⏰ **Deployment Status Unknown**\n\nThe deployment is taking longer than expected (${Math.round(elapsed / 1000 / 60)} minutes).\n\nPlease check manually:\n🔗 [View Website](${config.WEBSITE_URL})\n🔗 [Repository Actions](${config.GITHUB_REPO_URL}/actions)`;

            await this.telegramBot.api.sendMessage(
                deployment.chatId,
                timeoutMessage,
                {
                    parse_mode: 'Markdown',
                    reply_to_message_id: deployment.messageId,
                    disable_web_page_preview: true
                }
            );
        } else if (deployment.platform === 'discord' && this.discordClient) {
            const channel = await this.discordClient.channels.fetch(deployment.chatId);
            if (channel) {
                const timeoutMessage = `⏰ **Deployment Status Unknown**\n\nThe deployment is taking longer than expected (${Math.round(elapsed / 1000 / 60)} minutes).\n\nPlease check manually:\n🔗 [View Website](${config.WEBSITE_URL})\n🔗 [Repository Actions](${config.GITHUB_REPO_URL}/actions)`;

                await channel.send({
                    content: `${timeoutMessage} <@${deployment.userId}>`,
                    allowedMentions: { users: [deployment.userId] }
                });
            }
        }
    }


    startPollingIfNeeded() {
        if (!this.isPolling && this.pendingDeployments.size > 0) {
            this.isPolling = true;
            this.poll();
        }
    }

    async poll() {
        if (this.pendingDeployments.size === 0) {
            this.isPolling = false;
            return;
        }

        console.log(`Polling for ${this.pendingDeployments.size} pending deployments...`);

        const now = Date.now();
        const completedDeployments = [];

        for (const [commitSha, deployment] of this.pendingDeployments.entries()) {
            const elapsed = now - deployment.startTime;

            // Check for timeout
            if (elapsed > this.maxPollTime) {
                try {
                    await this.sendTimeoutMessage(deployment, elapsed);

                    if (this.auditLogger) {
                        await this.auditLogger.log(
                            'Deployment Timeout',
                            `Deployment ${commitSha.substring(0, 7)} timed out after ${Math.round(elapsed / 1000 / 60)} minutes`,
                            deployment.userId,
                            deployment.userName
                        );
                    }
                } catch (error) {
                    console.error('Failed to send timeout message:', error);
                }
                completedDeployments.push(commitSha);
                continue;
            }

            // Skip if we checked this deployment recently (avoid rate limiting)
            if (deployment.lastCheck && (now - deployment.lastCheck) < this.pollInterval) {
                continue;
            }

            try {
                const isDeployed = await this.checkDeploymentStatus(commitSha);
                deployment.lastCheck = now;

                if (isDeployed) {
                    await this.sendSuccessMessage(deployment, elapsed);

                    if (this.auditLogger) {
                        await this.auditLogger.logDeploymentComplete(commitSha, elapsed, deployment.userId);
                    }

                    completedDeployments.push(commitSha);
                }
            } catch (error) {
                console.error(`Error checking deployment ${commitSha}:`, error);
            }
        }

        // Remove completed deployments
        completedDeployments.forEach(sha => {
            this.pendingDeployments.delete(sha);
        });

        // Continue polling if there are still pending deployments
        if (this.pendingDeployments.size > 0) {
            setTimeout(() => this.poll(), this.pollInterval);
        } else {
            this.isPolling = false;
        }
    }

    async sendTimeoutMessage(deployment, elapsed) {
        const timeoutMessage = `⏰ **Deployment Status Unknown**\n\nThe deployment is taking longer than expected (${Math.round(elapsed / 1000 / 60)} minutes).\n\nPlease check manually:\n🔗 [View Website](${config.WEBSITE_URL})\n🔗 [Repository Actions](${config.GITHUB_REPO_URL}/actions)`;

        if (deployment.platform === 'telegram' && this.telegramBot) {
            await this.telegramBot.api.sendMessage(
                deployment.chatId,
                timeoutMessage,
                {
                    parse_mode: 'Markdown',
                    reply_to_message_id: deployment.messageId,
                    disable_web_page_preview: true
                }
            );
        } else if (deployment.platform === 'discord' && this.discordClient) {
            const channel = await this.discordClient.channels.fetch(deployment.chatId);
            if (channel) {
                await channel.send({
                    content: `${timeoutMessage} <@${deployment.userId}>`,
                    allowedMentions: { users: [deployment.userId] }
                });
            }
        }
    }

    async sendSuccessMessage(deployment, elapsed) {
        const successMessage = `✅ **Deployment Complete!**\n\nYour changes are now live on the website.\n\n🔗 [View Website](${config.WEBSITE_URL})\n\n_Deployment took ${Math.round(elapsed / 1000)} seconds_`;

        if (deployment.platform === 'telegram' && this.telegramBot) {
            await this.telegramBot.api.sendMessage(
                deployment.chatId,
                successMessage,
                {
                    parse_mode: 'Markdown',
                    reply_to_message_id: deployment.messageId,
                    disable_web_page_preview: true
                }
            );
        } else if (deployment.platform === 'discord' && this.discordClient) {
            const channel = await this.discordClient.channels.fetch(deployment.chatId);
            if (channel) {
                await channel.send({
                    content: `${successMessage} <@${deployment.userId}>`,
                    allowedMentions: { users: [deployment.userId] }
                });
            }
        }
    }

    async checkDeploymentStatus(commitSha) {
        try {
            // Method 1: Check if the commit is the latest on the live site
            const response = await fetch(`${config.WEBSITE_URL}data/about.json?t=${Date.now()}`, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                return false;
            }

            // Method 2: Check GitHub Pages API for latest deployment
            const deploymentCheck = await this.checkGitHubPagesDeployment(commitSha);
            return deploymentCheck;

        } catch (error) {
            console.error('Error in checkDeploymentStatus:', error);
            return false;
        }
    }

    async checkGitHubPagesDeployment(commitSha) {
        try {
            // Check GitHub API for Pages deployments
            const response = await fetch(`https://api.github.com/repos/${config.REPO_OWNER}/${config.REPO_NAME}/pages/builds`, {
                headers: {
                    'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'hotels-bot'
                }
            });

            if (!response.ok) {
                console.log('GitHub API response not ok:', response.status);
                return false;
            }

            const builds = await response.json();

            // Find the most recent build
            const latestBuild = builds[0];

            if (!latestBuild) {
                return false;
            }

            console.log(`Latest build: ${latestBuild.commit} (${latestBuild.status}), looking for: ${commitSha}`);

            // Check if our commit is built and deployed
            if (latestBuild.commit === commitSha && latestBuild.status === 'built') {
                return true;
            }

            // Also check if a newer commit has been built (means ours is definitely deployed)
            if (latestBuild.status === 'built') {
                // Get commit timestamps to see if the latest build is newer than ours
                const commitResponse = await fetch(`https://api.github.com/repos/${config.REPO_OWNER}/${config.REPO_NAME}/commits/${commitSha}`, {
                    headers: {
                        'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'hotels-bot'
                    }
                });

                if (commitResponse.ok) {
                    const commitData = await commitResponse.json();
                    const ourCommitTime = new Date(commitData.commit.author.date);
                    const latestBuildTime = new Date(latestBuild.created_at);

                    // If the latest build is newer than our commit, our changes are deployed
                    if (latestBuildTime > ourCommitTime) {
                        return true;
                    }
                }
            }

            return false;

        } catch (error) {
            console.error('Error checking GitHub Pages deployment:', error);
            return false;
        }
    }

    // Get status of all pending deployments
    getStatus() {
        const status = [];
        for (const [commitSha, deployment] of this.pendingDeployments.entries()) {
            const elapsed = Date.now() - deployment.startTime;
            status.push({
                commitSha: commitSha.substring(0, 7),
                elapsed: Math.round(elapsed / 1000),
                chatId: deployment.chatId,
                messageId: deployment.messageId,
                platform: deployment.platform
            });
        }
        return status;
    }
}
