import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const FILE_PATH = 'data/about.json';

export function registerAboutCommands(bot, deploymentPoller = null) {
    // Main about command
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

    // View current sections
    bot.callbackQuery('about_view', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            let message = `**${data.title}**\n\n`;
            data.sections.forEach((section, index) => {
                message += `**${index + 1}. ${section.heading}**\n${section.content}\n\n`;
            });

            await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add section flow
    bot.callbackQuery('about_add', async (ctx) => {
        sessionManager.set(ctx.from.id, {
            command: 'about',
            action: 'add_heading'
        });
        await ctx.editMessageText('Please enter the heading for the new section:');
    });

    // Remove section flow
    bot.callbackQuery('about_remove', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            if (data.sections.length === 0) {
                await ctx.editMessageText('No sections to remove.');
                return;
            }

            const keyboard = new InlineKeyboard();
            data.sections.forEach((section, index) => {
                keyboard.text(`${section.heading}`, `about_remove_${index}`).row();
            });
            keyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select a section to remove:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle remove section selection
    bot.callbackQuery(/^about_remove_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data: aboutData, sha } = await getFileContent(FILE_PATH);

            const removedSection = aboutData.sections.splice(sectionIndex, 1)[0];

            const commitSha = await updateFileContent(
                FILE_PATH,
                aboutData,
                sha,
                `Remove about section: ${removedSection.heading}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed section: **${removedSection.heading}**\n\n🔄 Deploying to website...`,
                { parse_mode: 'Markdown' }
            );

            // Start polling for deployment completion
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
}

export async function handleAboutTextInput(ctx, deploymentPoller = null) {
    const session = sessionManager.get(ctx.from.id);

    try {
        if (session.action === 'add_heading') {
            const heading = ctx.message.text.trim().toUpperCase();

            // Check if heading already exists
            const { data } = await getFileContent(FILE_PATH);
            const existingHeading = data.sections.find(
                section => section.heading.toLowerCase() === heading.toLowerCase()
            );

            if (existingHeading) {
                await ctx.reply(`❌ A section with heading "${heading}" already exists. Please choose a different heading:`);
                return;
            }

            session.heading = heading;
            session.action = 'add_content';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply(`Great! Now enter the content for the "${heading}" section:`);

        } else if (session.action === 'add_content') {
            const content = ctx.message.text.trim();
            const { data: aboutData, sha } = await getFileContent(FILE_PATH);

            // Add new section
            aboutData.sections.push({
                heading: session.heading,
                content: content
            });

            const commitSha = await updateFileContent(
                FILE_PATH,
                aboutData,
                sha,
                `Add about section: ${session.heading}`
            );

            const message = await ctx.reply(
                `✅ Added new section: **${session.heading}**\n\n🔄 Deploying to website...`,
                { parse_mode: 'Markdown' }
            );

            // Start polling for deployment completion
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
