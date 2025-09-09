import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const FILE_PATH = 'data/about.json';

function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

export function createAboutCommand() {
    return new SlashCommandBuilder()
        .setName('about')
        .setDescription('Manage about sections')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new about section')
                .addStringOption(option =>
                    option.setName('heading')
                        .setDescription('Heading of the section (will be converted to uppercase)')
                        .setRequired(true)
                        .setMaxLength(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an about section'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing about section'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all about sections'));
}

// Handle button interactions for about commands
export async function handleAboutButton(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    
    if (customId === 'about_view') {
        await handleViewSections(interaction);
    } else if (customId.startsWith('about_remove_')) {
        const sectionIndex = parseInt(customId.split('_')[2]);
        await handleRemoveSelect(interaction, sectionIndex, deploymentPoller, auditLogger);
    } else if (customId.startsWith('about_edit_')) {
        const sectionIndex = parseInt(customId.split('_')[2]);
        await handleEditSelect(interaction, sectionIndex, deploymentPoller, auditLogger);
    }
}

export async function handleAboutCommand(interaction, deploymentPoller, auditLogger) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'add':
            await handleAddSection(interaction, deploymentPoller, auditLogger);
            break;
        case 'remove':
            await handleRemoveSection(interaction, deploymentPoller, auditLogger);
            break;
        case 'edit':
            await handleEditSection(interaction, deploymentPoller, auditLogger);
            break;
        case 'view':
            await handleViewSections(interaction);
            break;
    }
}

async function handleAddSection(interaction, deploymentPoller, auditLogger) {
    const heading = interaction.options.getString('heading').trim().toUpperCase();

    try {
        // Check if heading already exists
        const { data } = await getFileContent(FILE_PATH);
        const existingHeading = data.sections.find(
            section => section.heading.toLowerCase() === heading.toLowerCase()
        );

        if (existingHeading) {
            await interaction.reply({
                content: `❌ A section with heading "${heading}" already exists. Please choose a different heading.`,
                flags: [64]
            });
            return;
        }

        // Show modal for content input
        const modal = new ModalBuilder()
            .setCustomId(`about_add_content_${Date.now()}`)
            .setTitle(`Add Content for "${heading}"`);

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Section Content')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter the content for this about section...')
            .setRequired(true)
            .setMaxLength(2000);

        const actionRow = new ActionRowBuilder().addComponents(contentInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);

        // Store the heading for when modal is submitted
        interaction.client.pendingAboutSections = interaction.client.pendingAboutSections || new Map();
        interaction.client.pendingAboutSections.set(interaction.user.id, { heading, action: 'add' });

    } catch (error) {
        console.error('Error in handleAddSection:', error);
        await interaction.reply({
            content: `❌ Error reading about sections: ${error.message}`,
            flags: [64]
        });
    }
}

async function handleRemoveSection(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No about sections found.',
                flags: [64]
            });
            return;
        }

        // Create select menu with existing sections
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('about_remove_select')
            .setPlaceholder('Select a section to remove')
            .addOptions(
                data.sections.map((section, index) => ({
                    label: truncateForSelectMenu(section.heading),
                    value: index.toString(),
                    description: truncateForSelectMenu(section.content)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**🗑️ Remove About Section**\n\nSelect the section you want to remove:',
            components: [row],
            flags: [64]
        });

    } catch (error) {
        console.error('Error in handleRemoveSection:', error);
        await interaction.reply({
            content: `❌ Error reading about sections: ${error.message}`,
            flags: [64]
        });
    }
}

async function handleEditSection(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No about sections found.',
                flags: [64]
            });
            return;
        }

        // Create select menu with existing sections
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('about_edit_select')
            .setPlaceholder('Select a section to edit')
            .addOptions(
                data.sections.map((section, index) => ({
                    label: truncateForSelectMenu(section.heading),
                    value: index.toString(),
                    description: truncateForSelectMenu(section.content)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '**✏️ Edit About Section**\n\nSelect the section you want to edit:',
            components: [row],
            flags: [64]
        });

    } catch (error) {
        console.error('Error in handleEditSection:', error);
        await interaction.reply({
            content: `❌ Error reading about sections: ${error.message}`,
            flags: [64]
        });
    }
}

async function handleViewSections(interaction) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No about sections found.',
                flags: [64]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📖 ${data.title}`)
            .setColor(0x0099FF)
            .setDescription(`Found ${data.sections.length} section(s):`);

        data.sections.forEach((section, index) => {
            embed.addFields({
                name: `${index + 1}. ${section.heading}`,
                value: section.content.length > 1000
                    ? section.content.substring(0, 1000) + '...'
                    : section.content,
                inline: false
            });
        });

        await interaction.reply({
            embeds: [embed],
            flags: [64]
        });

    } catch (error) {
        console.error('Error in handleViewSections:', error);
        await interaction.reply({
            content: `❌ Error reading about sections: ${error.message}`,
            flags: [64]
        });
    }
}

// Handle modal submissions
export async function handleAboutModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('about_add_content_')) {
        await handleAddContentModal(interaction, deploymentPoller, auditLogger);
    } else if (customId.startsWith('about_edit_content_')) {
        await handleEditContentModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddContentModal(interaction, deploymentPoller, auditLogger) {
    const content = interaction.fields.getTextInputValue('content').trim();
    const pendingSection = interaction.client.pendingAboutSections?.get(interaction.user.id);

    if (!pendingSection) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            flags: [64]
        });
        return;
    }

    try {
        const { data: aboutData, sha } = await getFileContent(FILE_PATH);

        // Add new section
        aboutData.sections.push({
            heading: pendingSection.heading,
            content: content
        });

        const commitSha = await updateFileContent(
            FILE_PATH,
            aboutData,
            sha,
            `Add about section: ${pendingSection.heading}`
        );

        await interaction.reply({
            content: `✅ **Section Added Successfully!**\n\n**Heading:** ${pendingSection.heading}\n**Content:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n🚀 Deploying changes...`,
            flags: [64]
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
            pendingSection.heading,
            FILE_PATH,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingAboutSections.delete(interaction.user.id);

    } catch (error) {
        console.error('Error adding about section:', error);
        await interaction.reply({
            content: `❌ Error adding section: ${error.message}`,
            flags: [64]
        });
    }
}

async function handleEditContentModal(interaction, deploymentPoller, auditLogger) {
    const content = interaction.fields.getTextInputValue('content').trim();
    const pendingSection = interaction.client.pendingAboutSections?.get(interaction.user.id);

    if (!pendingSection) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            flags: [64]
        });
        return;
    }

    try {
        const { data: aboutData, sha } = await getFileContent(FILE_PATH);

        // Find and update section
        const sectionIndex = parseInt(pendingSection.index);
        if (sectionIndex < 0 || sectionIndex >= aboutData.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                flags: [64]
            });
            return;
        }

        const oldContent = aboutData.sections[sectionIndex].content;
        aboutData.sections[sectionIndex].content = content;

        const commitSha = await updateFileContent(
            FILE_PATH,
            aboutData,
            sha,
            `Update about section: ${aboutData.sections[sectionIndex].heading}`
        );

        await interaction.reply({
            content: `✅ **Section Updated Successfully!**\n\n**Heading:** ${aboutData.sections[sectionIndex].heading}\n**New Content:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n🚀 Deploying changes...`,
            flags: [64]
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
            'Section Updated',
            `Updated "${aboutData.sections[sectionIndex].heading}" in ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingAboutSections.delete(interaction.user.id);

    } catch (error) {
        console.error('Error updating about section:', error);
        await interaction.reply({
            content: `❌ Error updating section: ${error.message}`,
            flags: [64]
        });
    }
}

// Handle select menu interactions
export async function handleAboutSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'about_remove_select') {
        await handleRemoveSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'about_edit_select') {
        await handleEditSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    }
}

async function handleRemoveSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data: aboutData, sha } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= aboutData.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                flags: [64]
            });
            return;
        }

        // Remove section
        const removedSection = aboutData.sections.splice(sectionIndex, 1)[0];

        const commitSha = await updateFileContent(
            FILE_PATH,
            aboutData,
            sha,
            `Remove about section: ${removedSection.heading}`
        );

        await interaction.reply({
            content: `✅ **Section Removed Successfully!**\n\n**Removed:** ${removedSection.heading}\n\n🚀 Deploying changes...`,
            flags: [64]
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
        console.error('Error removing about section:', error);
        await interaction.reply({
            content: `❌ Error removing section: ${error.message}`,
            flags: [64]
        });
    }
}

async function handleEditSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= data.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                flags: [64]
            });
            return;
        }

        const section = data.sections[sectionIndex];

        // Show modal for editing content
        const modal = new ModalBuilder()
            .setCustomId(`about_edit_content_${Date.now()}`)
            .setTitle(`Edit "${section.heading}"`);

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Section Content')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(section.content)
            .setRequired(true)
            .setMaxLength(2000);

        const actionRow = new ActionRowBuilder().addComponents(contentInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);

        // Store the index for when modal is submitted
        interaction.client.pendingAboutSections = interaction.client.pendingAboutSections || new Map();
        interaction.client.pendingAboutSections.set(interaction.user.id, {
            heading: section.heading,
            index: sectionIndex.toString(),
            action: 'edit'
        });

    } catch (error) {
        console.error('Error in handleEditSelect:', error);
        await interaction.reply({
            content: `❌ Error reading section: ${error.message}`,
            flags: [64]
        });
    }
}
