import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../../utils/github.js';
import { sessionManager } from '../../utils/sessions.js';

const FILE_PATH = 'data/more.json';

// Helper function to extract text content from HTML
function extractTextContent(html) {
    // Remove image tags first
    let text = html.replace(/<img[^>]*>/g, '');
    // Extract text from links
    text = text.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1');
    // Remove any remaining HTML tags
    text = text.replace(/<[^>]*>/g, '');
    return text.trim();
}

// Helper function to extract URL from HTML link
function extractUrl(html) {
    const match = html.match(/href=['"]([^'"]*)['"]/);
    return match ? match[1] : null;
}

// Text validation function
function isValidText(text) {
    return text && text.trim().length > 0;
}

// URL validation function
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
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
                        const displayText = extractTextContent(item.text);
                        const url = extractUrl(item.text);
                        if (url) {
                            message += `• [${displayText}](${url})\n`;
                        } else {
                            message += `• ${displayText}\n`;
                        }
                    });
                } else {
                    message += '_No content yet_\n';
                }
                message += '\n';
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
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
                    const displayText = extractTextContent(item.text);
                    const url = extractUrl(item.text);
                    if (url) {
                        message += `${index + 1}. [${displayText}](${url})\n`;
                    } else {
                        message += `${index + 1}. ${displayText}\n`;
                    }
                });
            } else {
                message += '_No content yet_\n';
            }

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
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
            action: 'add_content_display_text',
            sectionIndex: sectionIndex
        });
        await ctx.editMessageText('Please enter the display text (e.g., "@WGthink" or "Email"):');
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
                const displayText = extractTextContent(item.text);
                keyboard.text(`${displayText}`, `more_remove_content_${sectionIndex}_${index}`).row();
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
            const displayText = extractTextContent(removedItem.text);

            const commitSha = await updateFileContent(
                FILE_PATH,
                moreData,
                sha,
                `Remove content: ${displayText} from ${moreData.sections[sectionIndex].heading}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed content: **${displayText}**\n\n🔄 Deploying to website...`,
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

        } else if (session.action === 'add_content_display_text') {
            const displayText = ctx.message.text.trim();

            if (!isValidText(displayText)) {
                await ctx.reply('❌ Invalid display text. Please enter valid text:');
                return;
            }

            session.displayText = displayText;
            session.action = 'add_content_url';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply('Now enter the URL (optional, or type "skip"):');

        } else if (session.action === 'add_content_url') {
            const url = ctx.message.text.trim();

            if (url.toLowerCase() === 'skip') {
                session.url = '';
            } else if (!isValidUrl(url)) {
                await ctx.reply('❌ Invalid URL format. Please provide a valid URL or type "skip":');
                return;
            } else {
                session.url = url;
            }

            session.action = 'add_content_icon';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply('Finally, enter the icon type (optional, Options: "x", "youtube", "facebook", "web" or type "skip"):');

        } else if (session.action === 'add_content_icon') {
            const iconType = ctx.message.text.trim().toLowerCase();
            const finalIconType = iconType === 'skip' ? '' : iconType;

            const { data: moreData, sha } = await getFileContent(FILE_PATH);
            const section = moreData.sections[session.sectionIndex];

            if (!section.content) {
                section.content = [];
            }

            let htmlContent;

            if (session.url) {
                // Create HTML with link and optional icon
                if (finalIconType) {
                    const iconMap = {
                        'x': 'x.png',
                        'twitter': 'x.png',
                        'youtube': 'youtube.png',
                        'gmail': 'gmail.png',
                        'email': 'gmail.png',
                        'github': 'github.png',
                        'github_pages': 'github_pages.png'
                    };

                    const iconFile = iconMap[finalIconType] || `${finalIconType}.png`;
                    const iconClass = finalIconType === 'github_pages' ? 'icon-github-pages-large icon-github-pages' : `inline-icon icon-${finalIconType}`;

                    htmlContent = `<a href='${session.url}'><img src='images/icons/${iconFile}' alt='' class='${iconClass}'>${session.displayText}</a>`;
                } else {
                    htmlContent = `<a href='${session.url}'>${session.displayText}</a>`;
                }
            } else {
                // Plain text content
                htmlContent = session.displayText;
            }

            section.content.push({
                text: htmlContent
            });

            const commitSha = await updateFileContent(
                FILE_PATH,
                moreData,
                sha,
                `Add content: ${session.displayText} to ${section.heading}`
            );

            let messageText = `✅ Added content: **${session.displayText}**`;
            if (session.url) messageText += `\n🔗 URL: ${session.url}`;
            if (finalIconType) messageText += `\n🏷️ Icon: ${finalIconType}`;
            messageText += '\n\n🔄 Deploying to website...';

            const message = await ctx.reply(messageText, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

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
