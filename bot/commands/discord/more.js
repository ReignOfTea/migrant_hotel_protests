import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const FILE_PATH = 'data/more.json';

// Helper function to truncate text for Discord select menu options
function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Helper function to strip HTML tags for display
function stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').trim();
}

// Helper function to extract URL from HTML link
function extractUrl(html) {
    const match = html.match(/href=['"]([^'"]*)['"]/);
    return match ? match[1] : null;
}

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

export function createmoreCommand() {
    return new SlashCommandBuilder()
        .setName('more')
        .setDescription('Manage more sections and content')
        .addSubcommandGroup(group =>
            group
                .setName('section')
                .setDescription('Manage more sections')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a new more section')
                        .addStringOption(option =>
                            option.setName('heading')
                                .setDescription('Heading of the section')
                                .setRequired(true)
                                .setMaxLength(100)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a more section'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('view')
                        .setDescription('View all more sections')))
        .addSubcommandGroup(group =>
            group
                .setName('content')
                .setDescription('Manage content within sections')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add content to a section'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove content from a section')));
}

export async function handlemoreCommand(interaction, deploymentPoller, auditLogger) {
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup === 'section') {
        switch (subcommand) {
            case 'add':
                await handleAddSection(interaction, deploymentPoller, auditLogger);
                break;
            case 'remove':
                await handleRemoveSection(interaction, deploymentPoller, auditLogger);
                break;
            case 'view':
                await handleViewSections(interaction);
                break;
        }
    } else if (subcommandGroup === 'content') {
        switch (subcommand) {
            case 'add':
                await handleAddContent(interaction, deploymentPoller, auditLogger);
                break;
            case 'remove':
                await handleRemoveContent(interaction, deploymentPoller, auditLogger);
                break;
        }
    }
}

async function handleAddSection(interaction, deploymentPoller, auditLogger) {
    const heading = interaction.options.getString('heading').trim();

    try {
        const { data } = await getFileContent(FILE_PATH);
        const existingHeading = data.sections.find(
            section => section.heading.toLowerCase() === heading.toLowerCase()
        );

        if (existingHeading) {
            await interaction.reply({
                content: `❌ A section with heading "${heading}" already exists. Please choose a different heading.`,
                ephemeral: true
            });
            return;
        }

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

        await interaction.reply({
            content: `✅ **Section Added Successfully!**\n\n**Heading:** ${heading}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        await auditLogger.log(
            'Section Added',
            `Added section "${heading}" to ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error in handleAddSection:', error);
        await interaction.reply({
            content: `❌ Error adding section: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveSection(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No more sections found.',
                ephemeral: true
            });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('more_remove_section_select')
            .setPlaceholder('Select a section to remove')
            .addOptions(
                data.sections.map((section, index) => ({
                    label: truncateForSelectMenu(section.heading),
                    value: index.toString(),
                    description: `${section.content?.length || 0} items`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🗑️ Remove more Section**\n\nSelect the section you want to remove:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveSection:', error);
        await interaction.reply({
            content: `❌ Error reading more sections: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleViewSections(interaction) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No more sections found.',
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔗 ${data.title}`)
            .setColor(0x0099FF)
            .setDescription(`Found ${data.sections.length} section(s):`);

        data.sections.forEach((section, index) => {
            let fieldValue = '';

            if (section.content && section.content.length > 0) {
                section.content.forEach(item => {
                    const displayText = extractTextContent(item.text);
                    const url = extractUrl(item.text);
                    if (url) {
                        fieldValue += `• [${displayText}](${url})\n`;
                    } else {
                        fieldValue += `• ${displayText}\n`;
                    }
                });
            } else {
                fieldValue = '_No content yet_';
            }

            embed.addFields({
                name: `${index + 1}. ${section.heading}`,
                value: fieldValue.length > 1000 ? fieldValue.substring(0, 1000) + '...' : fieldValue,
                inline: false
            });
        });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleViewSections:', error);
        await interaction.reply({
            content: `❌ Error reading more sections: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleAddContent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No more sections found. Add a section first using `/more section add`.',
                ephemeral: true
            });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('more_add_content_select')
            .setPlaceholder('Select a section to add content to')
            .addOptions(
                data.sections.map((section, index) => ({
                    label: truncateForSelectMenu(section.heading),
                    value: index.toString(),
                    description: `${section.content?.length || 0} items`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**📝 Add Content to Section**\n\nSelect the section you want to add content to:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleAddContent:', error);
        await interaction.reply({
            content: `❌ Error reading more sections: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveContent(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No more sections found.',
                ephemeral: true
            });
            return;
        }

        const sectionsWithContent = data.sections.filter(section =>
            section.content && section.content.length > 0
        );

        if (sectionsWithContent.length === 0) {
            await interaction.reply({
                content: '❌ No sections with content found.',
                ephemeral: true
            });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('more_remove_content_section_select')
            .setPlaceholder('Select a section to remove content from')
            .addOptions(
                data.sections.map((section, index) => {
                    if (section.content && section.content.length > 0) {
                        return {
                            label: truncateForSelectMenu(section.heading),
                            value: index.toString(),
                            description: `${section.content.length} items`
                        };
                    }
                }).filter(Boolean)
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🗑️ Remove Content from Section**\n\nSelect the section you want to remove content from:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveContent:', error);
        await interaction.reply({
            content: `❌ Error reading more sections: ${error.message}`,
            ephemeral: true
        });
    }
}

export async function handlemoreModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('more_add_content_')) {
        await handleAddContentModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddContentModal(interaction, deploymentPoller, auditLogger) {
    const displayText = interaction.fields.getTextInputValue('display_text').trim();
    const url = interaction.fields.getTextInputValue('url').trim();
    const iconType = interaction.fields.getTextInputValue('icon_type').trim().toLowerCase();

    const pendingContent = interaction.client.pendingmoreContent?.get(interaction.user.id);

    if (!pendingContent) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            ephemeral: true
        });
        return;
    }

    if (!isValidText(displayText)) {
        await interaction.reply({
            content: '❌ Invalid display text. Please enter valid text.',
            ephemeral: true
        });
        return;
    }

    // Validate URL if provided
    if (url && !isValidUrl(url)) {
        await interaction.reply({
            content: '❌ Invalid URL format. Please provide a valid URL or leave empty for plain text.',
            ephemeral: true
        });
        return;
    }

    try {
        const { data: moreData, sha } = await getFileContent(FILE_PATH);
        const section = moreData.sections[pendingContent.sectionIndex];

        if (!section.content) {
            section.content = [];
        }

        let htmlContent;

        if (url) {
            // Create HTML with link and optional icon
            if (iconType) {
                const iconMap = {
                    'x': 'x.png',
                    'twitter': 'x.png',
                    'youtube': 'youtube.png',
                    'gmail': 'gmail.png',
                    'email': 'gmail.png',
                    'github': 'github.png',
                    'github_pages': 'github_pages.png'
                };

                const iconFile = iconMap[iconType] || `${iconType}.png`;
                const iconClass = iconType === 'github_pages' ? 'icon-github-pages-large icon-github-pages' : `inline-icon icon-${iconType}`;

                htmlContent = `<a href='${url}'><img src='images/icons/${iconFile}' alt='' class='${iconClass}'>${displayText}</a>`;
            } else {
                htmlContent = `<a href='${url}'>${displayText}</a>`;
            }
        } else {
            // Plain text content
            htmlContent = displayText;
        }

        section.content.push({
            text: htmlContent
        });

        const commitSha = await updateFileContent(
            FILE_PATH,
            moreData,
            sha,
            `Add content: ${displayText} to ${section.heading}`
        );

        let responseText = `✅ **Content Added Successfully!**\n\n**Text:** ${displayText}\n**Section:** ${section.heading}`;
        if (url) responseText += `\n**URL:** ${url}`;
        if (iconType) responseText += `\n**Icon:** ${iconType}`;
        responseText += '\n\n🚀 Deploying changes...';

        await interaction.reply({
            content: responseText,
            ephemeral: true
        });

        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        await auditLogger.log(
            'Content Added',
            `Added "${displayText}" to ${section.heading} in ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

        interaction.client.pendingmoreContent.delete(interaction.user.id);

    } catch (error) {
        console.error('Error adding content:', error);
        await interaction.reply({
            content: `❌ Error adding content: ${error.message}`,
            ephemeral: true
        });
    }
}

export async function handlemoreSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'more_remove_section_select') {
        await handleRemoveSectionSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'more_add_content_select') {
        await handleAddContentSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'more_remove_content_section_select') {
        await handleRemoveContentSectionSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId.startsWith('more_remove_content_')) {
        const sectionIndex = parseInt(customId.split('_')[3]);
        await handleRemoveContentSelect(interaction, sectionIndex, selectedIndex, deploymentPoller, auditLogger);
    }
}

async function handleRemoveSectionSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data: moreData, sha } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= moreData.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                ephemeral: true
            });
            return;
        }

        const removedSection = moreData.sections.splice(sectionIndex, 1)[0];

        const commitSha = await updateFileContent(
            FILE_PATH,
            moreData,
            sha,
            `Remove more section: ${removedSection.heading}`
        );

        await interaction.reply({
            content: `✅ **Section Removed Successfully!**\n\n**Removed:** ${removedSection.heading}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        await auditLogger.log(
            'Section Removed',
            `Removed section "${removedSection.heading}" from ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing section:', error);
        await interaction.reply({
            content: `❌ Error removing section: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleAddContentSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= data.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                ephemeral: true
            });
            return;
        }

        const section = data.sections[sectionIndex];

        const modal = new ModalBuilder()
            .setCustomId(`more_add_content_${Date.now()}`)
            .setTitle(`Add Content to "${section.heading}"`);

        const displayTextInput = new TextInputBuilder()
            .setCustomId('display_text')
            .setLabel('Display Text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., DJE Media')
            .setRequired(true)
            .setMaxLength(200);

        const urlInput = new TextInputBuilder()
            .setCustomId('url')
            .setLabel('URL (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., https://youtube.com/...')
            .setRequired(false)
            .setMaxLength(500);

        const iconInput = new TextInputBuilder()
            .setCustomId('icon_type')
            .setLabel('Icon Type (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Allowed values: x, youtube, facebook, web, none')
            .setRequired(false)
            .setMaxLength(50);

        const displayRow = new ActionRowBuilder().addComponents(displayTextInput);
        const urlRow = new ActionRowBuilder().addComponents(urlInput);
        const iconRow = new ActionRowBuilder().addComponents(iconInput);

        modal.addComponents(displayRow, urlRow, iconRow);

        await interaction.showModal(modal);

        interaction.client.pendingmoreContent = interaction.client.pendingmoreContent || new Map();
        interaction.client.pendingmoreContent.set(interaction.user.id, { sectionIndex });

    } catch (error) {
        console.error('Error in handleAddContentSelect:', error);
        await interaction.reply({
            content: `❌ Error reading section: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveContentSectionSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= data.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                ephemeral: true
            });
            return;
        }

        const section = data.sections[sectionIndex];

        if (!section.content || section.content.length === 0) {
            await interaction.reply({
                content: '❌ No content found in this section.',
                ephemeral: true
            });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`more_remove_content_${sectionIndex}`)
            .setPlaceholder('Select content to remove')
            .addOptions(
                section.content.map((item, index) => {
                    const displayText = extractTextContent(item.text);
                    return {
                        label: truncateForSelectMenu(displayText),
                        value: index.toString(),
                        description: truncateForSelectMenu(displayText, 50)
                    };
                })
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `**🗑️ Remove Content from "${section.heading}"**\n\nSelect the content you want to remove:`,
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveContentSectionSelect:', error);
        await interaction.reply({
            content: `❌ Error reading section: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveContentSelect(interaction, sectionIndex, contentIndex, deploymentPoller, auditLogger) {
    try {
        const { data: moreData, sha } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= moreData.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                ephemeral: true
            });
            return;
        }

        const section = moreData.sections[sectionIndex];

        if (!section.content || contentIndex < 0 || contentIndex >= section.content.length) {
            await interaction.reply({
                content: '❌ Content not found.',
                ephemeral: true
            });
            return;
        }

        const removedItem = section.content.splice(contentIndex, 1)[0];
        const displayText = extractTextContent(removedItem.text);

        const commitSha = await updateFileContent(
            FILE_PATH,
            moreData,
            sha,
            `Remove content: ${displayText} from ${section.heading}`
        );

        await interaction.reply({
            content: `✅ **Content Removed Successfully!**\n\n**Removed:** ${displayText}\n**From:** ${section.heading}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        await auditLogger.log(
            'Content Removed',
            `Removed "${displayText}" from ${section.heading} in ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing content:', error);
        await interaction.reply({
            content: `❌ Error removing content: ${error.message}`,
            ephemeral: true
        });
    }
}
