import 'dotenv/config';
import { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from './config/config.js';
import { sessionManager } from './utils/sessions.js';
import { authMiddleware } from './middleware/auth.js';
import { registerAboutCommands, handleAboutTextInput } from './commands/about.js';
import { registerAttendCommands, handleAttendTextInput } from './commands/attend.js';
import { registerSocialsCommands, handleSocialsTextInput } from './commands/socials.js';
import { registerLocationsCommands, handleLocationsTextInput } from './commands/locations.js';
import { registerEventsCommands, handleEventsTextInput } from './commands/events.js';
import { registerScheduleCommands, handleScheduleTextInput, registerScheduleCallbacks } from './commands/schedule.js';
import { DeploymentPoller } from './utils/polling.js';
import { AuditLogger } from './utils/audit.js';
import { EventScheduler } from './utils/scheduler.js';

// Initialize bot
const bot = new Bot(config.BOT_TOKEN);

// Initialize audit logger
const auditLogger = new AuditLogger(bot);

// Initialize deployment poller with audit logging
const deploymentPoller = new DeploymentPoller(bot, auditLogger);

// Initialize scheduler
const scheduler = new EventScheduler(auditLogger);

// Register start and help commands BEFORE auth middleware
bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('📖 About Sections', 'cmd_about')
        .text('📋 Attend Guidelines', 'cmd_attend')
        .row()
        .text('🔗 Social Links', 'cmd_socials')
        .text('📍 Locations', 'cmd_locations')
        .row()
        .text('📅 Events', 'cmd_events')
        .text('⏰ Schedule', 'cmd_schedule')
        .row()
        .text('🚀 Deployments', 'cmd_deployments')
        .text('❓ Help', 'cmd_help');

    await ctx.reply(
        '🏨 **Hotels Bot Control Panel**\n\nManage your website content with ease! Select an option below:',
        {
            reply_markup: keyboard,
            parse_mode: 'Markdown'
        }
    );

    // Log start command usage - handle undefined ctx.from
    if (ctx.from) {
        await auditLogger.log(
            'Bot Started',
            'User accessed the main menu',
            ctx.from.id,
            ctx.from.username || ctx.from.first_name
        );
    } else {
        console.log('Start command used but ctx.from is undefined');
    }
});

bot.command('help', async (ctx) => {
    const helpText = `**❓ Hotels Bot Help**

This bot helps you manage content for your hotels website. All changes are automatically deployed to GitHub Pages.

**📖 About Sections**
Add or remove informational sections about your cause.

**📋 Attend Guidelines** 
Manage rules and guidelines for event attendance.

**🔗 Social Links**
Organize social media links and contact information into sections.

**📍 Locations**
Add venues with addresses, coordinates, and map links. Each location gets a unique ID.

**📅 Events**
Schedule events at your registered locations with specific dates and times.

**⏰ Schedule**
Manage repeating events and automatic cleanup. Set events to repeat weekly and configure automatic removal of old events.

**🚀 Deployments**
Track the status of your website updates. Changes typically deploy within 1-2 minutes.

**💡 Tips:**
• Use /start for the main menu
• All text inputs are validated before saving
• You can cancel any operation with the Cancel button
• Deployments are tracked automatically
• Events older than ${config.EVENT_CLEANUP_DAYS} days are automatically removed
• Repeating events are added ${config.REPEATING_EVENT_ADVANCE_WEEKS} weeks in advance

**🔗 Website:** [${config.WEBSITE_URL}](${config.WEBSITE_URL})

Use /start to access the interactive menu.`;

    await ctx.reply(helpText, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    });
});

// Handle cancel callback BEFORE auth middleware
bot.callbackQuery('cancel', async (ctx) => {
    sessionManager.delete(ctx.from.id);
    await ctx.editMessageText('Operation cancelled.');
});

// Handle start menu callbacks BEFORE auth middleware
bot.callbackQuery('cmd_about', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Section', 'about_add')
        .text('Remove Section', 'about_remove')
        .row()
        .text('View Current', 'about_view')
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText('**📖 About Sections**\n\nManage the about sections of your website:', {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.callbackQuery('cmd_attend', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Section', 'attend_add')
        .text('Remove Section', 'attend_remove')
        .row()
        .text('View Current', 'attend_view')
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText('**📋 Attend Guidelines**\n\nManage the attendance guidelines:', {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.callbackQuery('cmd_socials', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Section', 'socials_add_section')
        .text('Remove Section', 'socials_remove_section')
        .row()
        .text('Manage Links', 'socials_manage_links')
        .text('View Current', 'socials_view')
        .row()
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText('**🔗 Social Links**\n\nManage social media links and contact information:', {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.callbackQuery('cmd_locations', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Location', 'locations_add')
        .text('Remove Location', 'locations_remove')
        .row()
        .text('View All', 'locations_view')
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText('**📍 Locations**\n\nManage event locations and venues:', {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.callbackQuery('cmd_events', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Event', 'events_add')
        .text('Remove Event', 'events_remove')
        .row()
        .text('View All', 'events_view')
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText('**📅 Events**\n\nSchedule and manage upcoming events:', {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.callbackQuery('cmd_schedule', async (ctx) => {
    const schedulerStatus = scheduler.getStatus();
    const statusText = schedulerStatus.isRunning ? '✅ Running' : '❌ Stopped';

    const keyboard = new InlineKeyboard()
        .text('Add Repeating Event', 'schedule_add')
        .text('Remove Repeating Event', 'schedule_remove')
        .row()
        .text('View All', 'schedule_view')
        .text('Toggle Event', 'schedule_toggle')
        .row()
        .text('Manual Cleanup', 'schedule_cleanup')
        .text('Manual Repeating', 'schedule_repeating')
        .row()
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText(
        `**⏰ Event Scheduler**\n\nAutomated event management system.\n\n**Status:** ${statusText}\n**Cleanup:** Every ${config.EVENT_CLEANUP_DAYS} days\n**Advance:** ${config.REPEATING_EVENT_ADVANCE_WEEKS} weeks\n\nWhat would you like to do?`,
        {
            reply_markup: keyboard,
            parse_mode: 'Markdown'
        }
    );
});

bot.callbackQuery('cmd_deployments', async (ctx) => {
    const status = deploymentPoller.getStatus();
    let message = '**🚀 Deployment Status**\n\n';

    if (status.length === 0) {
        message += 'No pending deployments.\n\n✅ All changes are live!';
    } else {
        message += 'Pending deployments:\n\n';
        status.forEach(dep => {
            message += `• \`${dep.commitSha}\` - ${dep.elapsed}s ago\n`;
        });
        message += '\n⏳ Please wait for deployments to complete...';
    }

    const keyboard = new InlineKeyboard()
        .text('🔄 Refresh', 'cmd_deployments')
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.callbackQuery('cmd_help', async (ctx) => {
    const helpText = `**❓ Hotels Bot Help**

This bot helps you manage content for your hotels website. All changes are automatically deployed to GitHub Pages.

**📖 About Sections**
Add or remove informational sections about your cause.

**📋 Attend Guidelines** 
Manage rules and guidelines for event attendance.

**🔗 Social Links**
Organize social media links and contact information into sections.

**📍 Locations**
Add venues with addresses, coordinates, and map links. Each location gets a unique ID.

**📅 Events**
Schedule events at your registered locations with specific dates and times.

**⏰ Schedule**
Manage repeating events and automatic cleanup. Set events to repeat weekly and configure automatic removal of old events.

**🚀 Deployments**
Track the status of your website updates. Changes typically deploy within 1-2 minutes.

**💡 Tips:**
• Use /start for the main menu
• All text inputs are validated before saving
• You can cancel any operation with the Cancel button
• Deployments are tracked automatically
• Events older than ${config.EVENT_CLEANUP_DAYS} days are automatically removed
• Repeating events are added ${config.REPEATING_EVENT_ADVANCE_WEEKS} weeks in advance

**🔗 Website:** [${config.WEBSITE_URL}](${config.WEBSITE_URL})`;

    const keyboard = new InlineKeyboard()
        .text('🔙 Back to Menu', 'back_to_start');

    await ctx.editMessageText(helpText, {
        reply_markup: keyboard,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    });
});

// Back to start menu
bot.callbackQuery('back_to_start', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('📖 About Sections', 'cmd_about')
        .text('📋 Attend Guidelines', 'cmd_attend')
        .row()
        .text('🔗 Social Links', 'cmd_socials')
        .text('📍 Locations', 'cmd_locations')
        .row()
        .text('📅 Events', 'cmd_events')
        .text('⏰ Schedule', 'cmd_schedule')
        .row()
        .text('🚀 Deployments', 'cmd_deployments')
        .text('❓ Help', 'cmd_help');

    await ctx.editMessageText(
        '🏨 **Hotels Bot Control Panel**\n\nManage your website content with ease! Select an option below:',
        {
            reply_markup: keyboard,
            parse_mode: 'Markdown'
        }
    );
});

// Apply auth middleware AFTER start/help commands and their callbacks
bot.use(authMiddleware);

// Register other commands with audit logging
registerAboutCommands(bot, deploymentPoller, auditLogger);
registerAttendCommands(bot, deploymentPoller, auditLogger);
registerSocialsCommands(bot, deploymentPoller, auditLogger);
registerLocationsCommands(bot, deploymentPoller, auditLogger);
registerEventsCommands(bot, deploymentPoller, auditLogger);
registerScheduleCommands(bot, deploymentPoller, scheduler);
registerScheduleCallbacks(bot);

// Handle text messages for active sessions
bot.on('message:text', async (ctx) => {
    const session = sessionManager.get(ctx.from.id);
    if (!session) return;

    switch (session.command) {
        case 'about':
            await handleAboutTextInput(ctx, deploymentPoller, auditLogger);
            break;
        case 'attend':
            await handleAttendTextInput(ctx, deploymentPoller, auditLogger);
            break;
        case 'socials':
            await handleSocialsTextInput(ctx, deploymentPoller, auditLogger);
            break;
        case 'locations':
            await handleLocationsTextInput(ctx, deploymentPoller, auditLogger);
            break;
        case 'events':
            await handleEventsTextInput(ctx, deploymentPoller, auditLogger);
            break;
        case 'schedule':
            await handleScheduleTextInput(ctx, deploymentPoller);
            break;
    }
});

// Legacy command support (still work as before)
bot.command('about', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Section', 'about_add')
        .text('Remove Section', 'about_remove')
        .row()
        .text('View Current', 'about_view');

    await ctx.reply('What would you like to do with the About sections?', {
        reply_markup: keyboard
    });
});

bot.command('attend', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Section', 'attend_add')
        .text('Remove Section', 'attend_remove')
        .row()
        .text('View Current', 'attend_view');

    await ctx.reply('What would you like to do with the Attend sections?', {
        reply_markup: keyboard
    });
});

bot.command('socials', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Section', 'socials_add_section')
        .text('Remove Section', 'socials_remove_section')
        .row()
        .text('Manage Links', 'socials_manage_links')
        .text('View Current', 'socials_view');

    await ctx.reply('What would you like to do with the Socials?', {
        reply_markup: keyboard
    });
});

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

bot.command('events', async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text('Add Event', 'events_add')
        .text('Remove Event', 'events_remove')
        .row()
        .text('View All', 'events_view');

    await ctx.reply('What would you like to do with events?', {
        reply_markup: keyboard
    });
});

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

// Debug command to check deployment status
bot.command('deployments', async (ctx) => {
    const status = deploymentPoller.getStatus();
    if (status.length === 0) {
        await ctx.reply('No pending deployments.');
    } else {
        let message = '**Pending Deployments:**\n\n';
        status.forEach(dep => {
            message += `• ${dep.commitSha} - ${dep.elapsed}s ago\n`;
        });
        await ctx.reply(message, { parse_mode: 'Markdown' });
    }
});

// Error handling with audit logging
bot.catch(async (err) => {
    console.error('Bot error:', err);

    // Handle cases where ctx or ctx.from might be undefined
    try {
        if (err.ctx && err.ctx.from) {
            await auditLogger.logError(
                err.error || err,
                'Bot Error',
                err.ctx.from.id,
                err.ctx.from.username || err.ctx.from.first_name
            );
        } else {
            console.log('Error occurred but unable to identify user context');
        }
    } catch (auditError) {
        console.error('Failed to log error to audit:', auditError);
    }
});

// Start the bot and scheduler
bot.start();
scheduler.start();

console.log('Bot started successfully with deployment polling, audit logging, and event scheduling!');
