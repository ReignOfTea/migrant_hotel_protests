import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const FILE_PATH = 'data/more.json';

// Text validation function
function isValidText(text) {
    return text && text.trim().length > 0;
}

export function registermoreCommands(bot, deploymentPoller = null) {
    // Main more command
    bot.command('more', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('Add Section', 'more_add_section')
            .text('Remove Section', 'more_remove_section')
            .row()
            .text('Manage Content', 'more_manage_content')
            .text('View Current', 'more_view');

        await ctx.reply('What would you like to do with the more?', {
            reply_markup: keyboard
        });
    });

    // View current sections
    bot.callbackQuery('more_view', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            let message = `**${data.title}**\n\n`;
            data.sections.forEach((section, index) => {
                message += `**${index + 1}. ${section.heading}**\n`;
                if (section.content && section.content.length > 0) {
                    section.content.forEach(item => {
                        message += `• ${item.text}\n`;
                    });
                } else {
                    message += '_No content yet_\n';
                }
                message += '\n';
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add new section
    bot.callbackQuery('more_add_section', async (ctx) => {
        sessionManager.set(ctx.from.id, {
            command: 'more',
            action: 'add_section_heading'
        });
        await ctx.editMessageText('Please enter the heading for the new more section:');
    });

    // Remove section
    bot.callbackQuery('more_remove_section', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            if (data.sections.length === 0) {
                await ctx.editMessageText('No sections to remove.');
                return;
            }

            const keyboard = new InlineKeyboard();
            data.sections.forEach((section, index) => {
                keyboard.text(`${section.heading}`, `more_remove_section_${index}`).row();
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
    bot.callbackQuery(/^more_remove_section_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data: moreData, sha } = await getFileContent(FILE_PATH);

            const removedSection = moreData.sections.splice(sectionIndex, 1)[0];

            const commitSha = await updateFileContent(
                FILE_PATH,
                moreData,
                sha,
                `Remove more section: ${removedSection.heading}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed section: **${removedSection.heading}**\n\n🔄 Deploying to website...`,
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

    // Manage content in sections
    bot.callbackQuery('more_manage_content', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            if (data.sections.length === 0) {
                await ctx.editMessageText('No sections available. Add a section first.');
                return;
            }

            const keyboard = new InlineKeyboard();
            data.sections.forEach((section, index) => {
                const itemCount = section.content?.length || 0;
                keyboard.text(`${section.heading} (${itemCount} items)`, `more_section_${index}`).row();
            });
            keyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select a section to manage content:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle section selection for content management
    bot.callbackQuery(/^more_section_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data } = await getFileContent(FILE_PATH);
            const section = data.sections[sectionIndex];

            const keyboard = new InlineKeyboard()
                .text('Add Content', `more_add_content_${sectionIndex}`)
                .text('Remove Content', `more_remove_content_${sectionIndex}`)
                .row()
                .text('Back', 'more_manage_content');

            let message = `**${section.heading}**\n\nCurrent content:\n`;
            if (section.content && section.content.length > 0) {
                section.content.forEach((item, index) => {
                    message += `${index + 1}. ${item.text}\n`;
                });
            } else {
                message += '_No content yet_\n';
            }

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Add content to section
    bot.callbackQuery(/^more_add_content_(\d+)$/, async (ctx) => {
        const sectionIndex = parseInt(ctx.match[1]);
        sessionManager.set(ctx.from.id, {
            command: 'more',
            action: 'add_content_text',
            sectionIndex: sectionIndex
        });
        await ctx.editMessageText('Please enter the text content (e.g., "@WGthink"):');
    });

    // Remove content from section
    bot.callbackQuery(/^more_remove_content_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data } = await getFileContent(FILE_PATH);
            const section = data.sections[sectionIndex];

            if (!section.content || section.content.length === 0) {
                await ctx.editMessageText('No content to remove in this section.');
                return;
            }

            const keyboard = new InlineKeyboard();
            section.content.forEach((item, index) => {
                keyboard.text(`${item.text}`, `more_remove_content_${sectionIndex}_${index}`).row();
            });
            keyboard.text('Back', `more_section_${sectionIndex}`);

            await ctx.editMessageText('Select content to remove:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle specific content removal
    bot.callbackQuery(/^more_remove_content_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const contentIndex = parseInt(ctx.match[2]);
            const { data: moreData, sha } = await getFileContent(FILE_PATH);

            const removedItem = moreData.sections[sectionIndex].content.splice(contentIndex, 1)[0];

            const commitSha = await updateFileContent(
                FILE_PATH,
                moreData,
                sha,
                `Remove content: ${removedItem.text} from ${moreData.sections[sectionIndex].heading}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed content: **${removedItem.text}**\n\n🔄 Deploying to website...`,
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
}

export async function handlemoreTextInput(ctx, deploymentPoller = null) {
    const session = sessionManager.get(ctx.from.id);

    try {
        if (session.action === 'add_section_heading') {
            const heading = ctx.message.text.trim();

            // Check if heading already exists
            const { data } = await getFileContent(FILE_PATH);
            const existingHeading = data.sections.find(
                section => section.heading.toLowerCase() === heading.toLowerCase()
            );

            if (existingHeading) {
                await ctx.reply(`❌ A section with heading "${heading}" already exists. Please choose a different heading:`);
                return;
            }

            // Add new section
            const { data: moreData, sha } = await getFileContent(FILE_PATH);
            moreData.sections.push({
                heading: heading,
                content: []
            });

            const commitSha = await updateFileContent(
                FILE_PATH,
                moreData,
                sha,
                `Add more section: ${heading}`
            );

            const message = await ctx.reply(
                `✅ Added new section: **${heading}**\n\n🔄 Deploying to website...`,
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

        } else if (session.action === 'add_content_text') {
            const textContent = ctx.message.text.trim();

            if (!isValidText(textContent)) {
                await ctx.reply('❌ Invalid text content. Please enter valid text:');
                return;
            }

            const { data: moreData, sha } = await getFileContent(FILE_PATH);
            const section = moreData.sections[session.sectionIndex];

            if (!section.content) {
                section.content = [];
            }

            section.content.push({
                text: textContent
            });

            const commitSha = await updateFileContent(
                FILE_PATH,
                moreData,
                sha,
                `Add content: ${textContent} to ${section.heading}`
            );

            const message = await ctx.reply(
                `✅ Added content: **${textContent}**\n\n🔄 Deploying to website...`,
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
