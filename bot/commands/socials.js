import { InlineKeyboard } from 'grammy';
import { getFileContent, updateFileContent } from '../utils/github.js';
import { sessionManager } from '../utils/sessions.js';

const FILE_PATH = 'data/socials.json';

// URL validation function
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    } catch (_) {
        return false;
    }
}

export function registerSocialsCommands(bot, deploymentPoller = null) {
    // Main socials command
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

    // View current sections
    bot.callbackQuery('socials_view', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            let message = `**${data.title}**\n\n`;
            data.sections.forEach((section, index) => {
                message += `**${index + 1}. ${section.heading}**\n`;
                if (section.type === 'links' && section.links) {
                    section.links.forEach(link => {
                        message += `• [${link.text}](${link.url})\n`;
                    });
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
    bot.callbackQuery('socials_add_section', async (ctx) => {
        sessionManager.set(ctx.from.id, {
            command: 'socials',
            action: 'add_section_heading'
        });
        await ctx.editMessageText('Please enter the heading for the new socials section:');
    });

    // Remove section
    bot.callbackQuery('socials_remove_section', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            if (data.sections.length === 0) {
                await ctx.editMessageText('No sections to remove.');
                return;
            }

            const keyboard = new InlineKeyboard();
            data.sections.forEach((section, index) => {
                keyboard.text(`${section.heading}`, `socials_remove_section_${index}`).row();
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
    bot.callbackQuery(/^socials_remove_section_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data: socialsData, sha } = await getFileContent(FILE_PATH);

            const removedSection = socialsData.sections.splice(sectionIndex, 1)[0];

            const commitSha = await updateFileContent(
                FILE_PATH,
                socialsData,
                sha,
                `Remove socials section: ${removedSection.heading}`
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

    // Manage links in sections
    bot.callbackQuery('socials_manage_links', async (ctx) => {
        try {
            const { data } = await getFileContent(FILE_PATH);

            if (data.sections.length === 0) {
                await ctx.editMessageText('No sections available. Add a section first.');
                return;
            }

            const keyboard = new InlineKeyboard();
            data.sections.forEach((section, index) => {
                keyboard.text(`${section.heading} (${section.links?.length || 0} links)`, `socials_section_${index}`).row();
            });
            keyboard.text('Cancel', 'cancel');

            await ctx.editMessageText('Select a section to manage links:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle section selection for link management
    bot.callbackQuery(/^socials_section_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data } = await getFileContent(FILE_PATH);
            const section = data.sections[sectionIndex];

            const keyboard = new InlineKeyboard()
                .text('Add Link', `socials_add_link_${sectionIndex}`)
                .text('Remove Link', `socials_remove_link_${sectionIndex}`)
                .row()
                .text('Back', 'socials_manage_links');

            let message = `**${section.heading}**\n\nCurrent links:\n`;
            if (section.links && section.links.length > 0) {
                section.links.forEach((link, index) => {
                    message += `${index + 1}. [${link.text}](${link.url})\n`;
                });
            } else {
                message += '_No links yet_\n';
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

    // Add link to section
    bot.callbackQuery(/^socials_add_link_(\d+)$/, async (ctx) => {
        const sectionIndex = parseInt(ctx.match[1]);
        sessionManager.set(ctx.from.id, {
            command: 'socials',
            action: 'add_link_text',
            sectionIndex: sectionIndex
        });
        await ctx.editMessageText('Please enter the text for the link (e.g., "Jonathan Wong (@WGthink)"):');
    });

    // Remove link from section
    bot.callbackQuery(/^socials_remove_link_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const { data } = await getFileContent(FILE_PATH);
            const section = data.sections[sectionIndex];

            if (!section.links || section.links.length === 0) {
                await ctx.editMessageText('No links to remove in this section.');
                return;
            }

            const keyboard = new InlineKeyboard();
            section.links.forEach((link, index) => {
                keyboard.text(`${link.text}`, `socials_remove_link_${sectionIndex}_${index}`).row();
            });
            keyboard.text('Back', `socials_section_${sectionIndex}`);

            await ctx.editMessageText('Select a link to remove:', {
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.editMessageText(`Error: ${error.message}`);
        }
    });

    // Handle specific link removal
    bot.callbackQuery(/^socials_remove_link_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const sectionIndex = parseInt(ctx.match[1]);
            const linkIndex = parseInt(ctx.match[2]);
            const { data: socialsData, sha } = await getFileContent(FILE_PATH);

            const removedLink = socialsData.sections[sectionIndex].links.splice(linkIndex, 1)[0];

            const commitSha = await updateFileContent(
                FILE_PATH,
                socialsData,
                sha,
                `Remove link: ${removedLink.text} from ${socialsData.sections[sectionIndex].heading}`
            );

            const message = await ctx.editMessageText(
                `✅ Removed link: **${removedLink.text}**\n\n🔄 Deploying to website...`,
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

export async function handleSocialsTextInput(ctx, deploymentPoller = null) {
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
            const { data: socialsData, sha } = await getFileContent(FILE_PATH);
            socialsData.sections.push({
                heading: heading,
                type: 'links',
                links: []
            });

            const commitSha = await updateFileContent(
                FILE_PATH,
                socialsData,
                sha,
                `Add socials section: ${heading}`
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

        } else if (session.action === 'add_link_text') {
            const linkText = ctx.message.text.trim();
            session.linkText = linkText;
            session.action = 'add_link_url';
            sessionManager.set(ctx.from.id, session);
            await ctx.reply(`Great! Now enter the URL for "${linkText}":`);

        } else if (session.action === 'add_link_url') {
            const url = ctx.message.text.trim();

            if (!isValidUrl(url)) {
                await ctx.reply('❌ Invalid URL. Please enter a valid URL (must start with http://, https://, or mailto:):');
                return;
            }

            const { data: socialsData, sha } = await getFileContent(FILE_PATH);
            const section = socialsData.sections[session.sectionIndex];

            if (!section.links) {
                section.links = [];
            }

            section.links.push({
                text: session.linkText,
                url: url
            });

            const commitSha = await updateFileContent(
                FILE_PATH,
                socialsData,
                sha,
                `Add link: ${session.linkText} to ${section.heading}`
            );

            const message = await ctx.reply(
                `✅ Added link: **${session.linkText}**\n\n🔄 Deploying to website...`,
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
