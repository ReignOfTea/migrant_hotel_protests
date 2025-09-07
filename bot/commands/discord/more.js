import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const FILE_PATH = 'data/more.json';

// Helper function to truncate text for Discord select menu options
function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// URL validation function
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    } catch (_) {
        return false;
    }
}

export function createmoreCommand() {
    return new SlashCommandBuilder()
        .setName('more')
        .setDescription('Manage more sections and links')
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
                .setName('link')
                .setDescription('Manage links within sections')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a link to a section'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a link from a section')));
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
    } else if (subcommandGroup === 'link') {
        switch (subcommand) {
            case 'add':
                await handleAddLink(interaction, deploymentPoller, auditLogger);
                break;
            case 'remove':
                await handleRemoveLink(interaction, deploymentPoller, auditLogger);
                break;
        }
    }
}

async function handleAddSection(interaction, deploymentPoller, auditLogger) {
    const heading = interaction.options.getString('heading').trim();

    try {
        // Check if heading already exists
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

        // Add new section
        const { data: moreData, sha } = await getFileContent(FILE_PATH);
        moreData.sections.push({
            heading: heading,
            type: 'links',
            links: []
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

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.logSectionAdd(
            heading,
            FILE_PATH,
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

        // Create select menu with existing sections
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('more_remove_section_select')
            .setPlaceholder('Select a section to remove')
            .addOptions(
                data.sections.map((section, index) => ({
                    label: truncateForSelectMenu(section.heading),
                    value: index.toString(),
                    description: `${section.links?.length || 0} links`
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
            if (section.links && section.links.length > 0) {
                section.links.forEach(link => {
                    fieldValue += `• [${link.text}](${link.url})\n`;
                });
            } else {
                fieldValue = '_No links yet_';
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

async function handleAddLink(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No more sections found. Add a section first using `/more section add`.',
                ephemeral: true
            });
            return;
        }

        // Create select menu with existing sections
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('more_add_link_select')
            .setPlaceholder('Select a section to add a link to')
            .addOptions(
                data.sections.map((section, index) => ({
                    label: truncateForSelectMenu(section.heading),
                    value: index.toString(),
                    description: `${section.links?.length || 0} links`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🔗 Add Link to Section**\n\nSelect the section you want to add a link to:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleAddLink:', error);
        await interaction.reply({
            content: `❌ Error reading more sections: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveLink(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No more sections found.',
                ephemeral: true
            });
            return;
        }

        // Filter sections that have links
        const sectionsWithLinks = data.sections.filter(section => section.links && section.links.length > 0);

        if (sectionsWithLinks.length === 0) {
            await interaction.reply({
                content: '❌ No sections with links found.',
                ephemeral: true
            });
            return;
        }

        // Create select menu with sections that have links
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('more_remove_link_section_select')
            .setPlaceholder('Select a section to remove a link from')
            .addOptions(
                data.sections.map((section, index) => {
                    if (section.links && section.links.length > 0) {
                        return {
                            label: truncateForSelectMenu(section.heading),
                            value: index.toString(),
                            description: `${section.links.length} links`
                        };
                    }
                }).filter(Boolean)
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🗑️ Remove Link from Section**\n\nSelect the section you want to remove a link from:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveLink:', error);
        await interaction.reply({
            content: `❌ Error reading more sections: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle modal submissions
export async function handlemoreModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('more_add_link_')) {
        await handleAddLinkModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddLinkModal(interaction, deploymentPoller, auditLogger) {
    const linkText = interaction.fields.getTextInputValue('link_text').trim();
    const linkUrl = interaction.fields.getTextInputValue('link_url').trim();

    const pendingLink = interaction.client.pendingmoreLinks?.get(interaction.user.id);

    if (!pendingLink) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            ephemeral: true
        });
        return;
    }

    // Validate URL
    if (!isValidUrl(linkUrl)) {
        await interaction.reply({
            content: '❌ Invalid URL. Please enter a valid URL (must start with http://, https://, or mailto:).',
            ephemeral: true
        });
        return;
    }

    try {
        const { data: moreData, sha } = await getFileContent(FILE_PATH);
        const section = moreData.sections[pendingLink.sectionIndex];

        if (!section.links) {
            section.links = [];
        }

        section.links.push({
            text: linkText,
            url: linkUrl
        });

        const commitSha = await updateFileContent(
            FILE_PATH,
            moreData,
            sha,
            `Add link: ${linkText} to ${section.heading}`
        );

        await interaction.reply({
            content: `✅ **Link Added Successfully!**\n\n**Text:** ${linkText}\n**URL:** ${linkUrl}\n**Section:** ${section.heading}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.log(
            'Link Added',
            `Added "${linkText}" to ${section.heading} in ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingmoreLinks.delete(interaction.user.id);

    } catch (error) {
        console.error('Error adding link:', error);
        await interaction.reply({
            content: `❌ Error adding link: ${error.message}`,
            ephemeral: true
        });
    }
}

// Handle select menu interactions
export async function handlemoreSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'more_remove_section_select') {
        await handleRemoveSectionSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'more_add_link_select') {
        await handleAddLinkSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'more_remove_link_section_select') {
        await handleRemoveLinkSectionSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId.startsWith('more_remove_link_')) {
        const sectionIndex = parseInt(customId.split('_')[3]);
        await handleRemoveLinkSelect(interaction, sectionIndex, selectedIndex, deploymentPoller, auditLogger);
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

        // Remove section
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

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.logSectionRemove(
            removedSection.heading,
            FILE_PATH,
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

async function handleAddLinkSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
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

        // Show modal for link input
        const modal = new ModalBuilder()
            .setCustomId(`more_add_link_${Date.now()}`)
            .setTitle(`Add Link to "${section.heading}"`);

        const textInput = new TextInputBuilder()
            .setCustomId('link_text')
            .setLabel('Link Text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Jonathan Wong (@WGthink)')
            .setRequired(true)
            .setMaxLength(100);

        const urlInput = new TextInputBuilder()
            .setCustomId('link_url')
            .setLabel('Link URL')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., https://twitter.com/WGthink')
            .setRequired(true)
            .setMaxLength(500);

        const textRow = new ActionRowBuilder().addComponents(textInput);
        const urlRow = new ActionRowBuilder().addComponents(urlInput);
        modal.addComponents(textRow, urlRow);

        await interaction.showModal(modal);

        // Store the section index for when modal is submitted
        interaction.client.pendingmoreLinks = interaction.client.pendingmoreLinks || new Map();
        interaction.client.pendingmoreLinks.set(interaction.user.id, { sectionIndex });

    } catch (error) {
        console.error('Error in handleAddLinkSelect:', error);
        await interaction.reply({
            content: `❌ Error reading section: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveLinkSectionSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
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

        if (!section.links || section.links.length === 0) {
            await interaction.reply({
                content: '❌ No links found in this section.',
                ephemeral: true
            });
            return;
        }

        // Create select menu with links in this section
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`more_remove_link_${sectionIndex}`)
            .setPlaceholder('Select a link to remove')
            .addOptions(
                section.links.map((link, index) => ({
                    label: truncateForSelectMenu(link.text),
                    value: index.toString(),
                    description: truncateForSelectMenu(link.url)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `**🗑️ Remove Link from "${section.heading}"**\n\nSelect the link you want to remove:`,
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveLinkSectionSelect:', error);
        await interaction.reply({
            content: `❌ Error reading section: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRemoveLinkSelect(interaction, sectionIndex, linkIndex, deploymentPoller, auditLogger) {
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

        if (!section.links || linkIndex < 0 || linkIndex >= section.links.length) {
            await interaction.reply({
                content: '❌ Link not found.',
                ephemeral: true
            });
            return;
        }

        // Remove link
        const removedLink = section.links.splice(linkIndex, 1)[0];

        const commitSha = await updateFileContent(
            FILE_PATH,
            moreData,
            sha,
            `Remove link: ${removedLink.text} from ${section.heading}`
        );

        await interaction.reply({
            content: `✅ **Link Removed Successfully!**\n\n**Removed:** ${removedLink.text}\n**From:** ${section.heading}\n\n🚀 Deploying changes...`,
            ephemeral: true
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            'discord'
        );

        // Log audit
        await auditLogger.log(
            'Link Removed',
            `Removed "${removedLink.text}" from ${section.heading} in ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing link:', error);
        await interaction.reply({
            content: `❌ Error removing link: ${error.message}`,
            ephemeral: true
        });
    }
}
