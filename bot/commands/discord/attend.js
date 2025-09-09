import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, MessageFlags, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { getFileContent, updateFileContent } from '../../utils/github.js';

const FILE_PATH = 'data/attend.json';

function truncateForSelectMenu(text, maxLength = 97) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

export function createAttendCommand() {
    return new SlashCommandBuilder()
        .setName('attend')
        .setDescription('Manage attend sections')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new attend section')
                .addStringOption(option =>
                    option.setName('heading')
                        .setDescription('Heading of the section (will be converted to uppercase)')
                        .setRequired(true)
                        .setMaxLength(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an attend section'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing attend section'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all attend sections'));
}

// Handle button interactions for attend commands
export async function handleAttendButton(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    
    if (customId === 'attend_view') {
        await handleViewSections(interaction);
    } else if (customId.startsWith('attend_remove_')) {
        const sectionIndex = parseInt(customId.split('_')[2]);
        await handleRemoveSelect(interaction, sectionIndex, deploymentPoller, auditLogger);
    } else if (customId.startsWith('attend_edit_')) {
        const sectionIndex = parseInt(customId.split('_')[2]);
        await handleEditSelect(interaction, sectionIndex, deploymentPoller, auditLogger);
    }
}

export async function handleAttendCommand(interaction, deploymentPoller, auditLogger) {
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
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Show modal for content input
        const modal = new ModalBuilder()
            .setCustomId(`attend_add_content_${Date.now()}`)
            .setTitle(`Add Content for "${heading}"`);

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Section Content')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter the content for this attend section...')
            .setRequired(true)
            .setMaxLength(2000);

        const actionRow = new ActionRowBuilder().addComponents(contentInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);

        // Store the heading for when modal is submitted
        interaction.client.pendingAttendSections = interaction.client.pendingAttendSections || new Map();
        interaction.client.pendingAttendSections.set(interaction.user.id, { heading, action: 'add' });

    } catch (error) {
        console.error('Error in handleAddSection:', error);
        await interaction.reply({
            content: `❌ Error reading attend sections: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRemoveSection(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No attend sections found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Create select menu with existing sections
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('attend_remove_select')
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
            content: '**🗑️ Remove Attend Section**\n\nSelect the section you want to remove:',
            components: [row],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('Error in handleRemoveSection:', error);
        await interaction.reply({
            content: `❌ Error reading attend sections: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleEditSection(interaction, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No attend sections found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Create select menu with existing sections
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('attend_edit_select')
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
            content: '**✏️ Edit Attend Section**\n\nSelect the section you want to edit:',
            components: [row],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('Error in handleEditSection:', error);
        await interaction.reply({
            content: `❌ Error reading attend sections: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleViewSections(interaction) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (data.sections.length === 0) {
            await interaction.reply({
                content: '❌ No attend sections found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🏨 ${data.title}`)
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
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('Error in handleViewSections:', error);
        await interaction.reply({
            content: `❌ Error reading attend sections: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle modal submissions
export async function handleAttendModal(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;

    if (customId.startsWith('attend_add_content_')) {
        await handleAddContentModal(interaction, deploymentPoller, auditLogger);
    } else if (customId.startsWith('attend_edit_content_')) {
        await handleEditContentModal(interaction, deploymentPoller, auditLogger);
    }
}

async function handleAddContentModal(interaction, deploymentPoller, auditLogger) {
    const content = interaction.fields.getTextInputValue('content').trim();
    const pendingSection = interaction.client.pendingAttendSections?.get(interaction.user.id);

    if (!pendingSection) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        const { data: attendData, sha } = await getFileContent(FILE_PATH);

        // Add new section
        attendData.sections.push({
            heading: pendingSection.heading,
            content: content
        });

        const commitSha = await updateFileContent(
            FILE_PATH,
            attendData,
            sha,
            `Add attend section: ${pendingSection.heading}`
        );

        await interaction.reply({
            content: `✅ **Section Added Successfully!**\n\n**Heading:** ${pendingSection.heading}\n**Content:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n🚀 Deploying changes...`,
            flags: MessageFlags.Ephemeral
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            "discord"
        );

        // Log audit
        await auditLogger.logSectionAdd(
            pendingSection.heading,
            FILE_PATH,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingAttendSections.delete(interaction.user.id);

    } catch (error) {
        console.error('Error adding attend section:', error);
        await interaction.reply({
            content: `❌ Error adding section: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleEditContentModal(interaction, deploymentPoller, auditLogger) {
    const content = interaction.fields.getTextInputValue('content').trim();
    const pendingSection = interaction.client.pendingAttendSections?.get(interaction.user.id);

    if (!pendingSection) {
        await interaction.reply({
            content: '❌ Session expired. Please try again.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        const { data: attendData, sha } = await getFileContent(FILE_PATH);

        // Find and update section
        const sectionIndex = parseInt(pendingSection.index);
        if (sectionIndex < 0 || sectionIndex >= attendData.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const oldContent = attendData.sections[sectionIndex].content;
        attendData.sections[sectionIndex].content = content;

        const commitSha = await updateFileContent(
            FILE_PATH,
            attendData,
            sha,
            `Update attend section: ${attendData.sections[sectionIndex].heading}`
        );

        await interaction.reply({
            content: `✅ **Section Updated Successfully!**\n\n**Heading:** ${attendData.sections[sectionIndex].heading}\n**New Content:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n🚀 Deploying changes...`,
            flags: MessageFlags.Ephemeral
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            "discord"
        );

        // Log audit
        await auditLogger.log(
            'Section Updated',
            `Updated "${attendData.sections[sectionIndex].heading}" in ${FILE_PATH}`,
            interaction.user.id,
            interaction.user.username
        );

        // Clean up
        interaction.client.pendingAttendSections.delete(interaction.user.id);

    } catch (error) {
        console.error('Error updating attend section:', error);
        await interaction.reply({
            content: `❌ Error updating section: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

// Handle select menu interactions
export async function handleAttendSelect(interaction, deploymentPoller, auditLogger) {
    const customId = interaction.customId;
    const selectedIndex = parseInt(interaction.values[0]);

    if (customId === 'attend_remove_select') {
        await handleRemoveSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    } else if (customId === 'attend_edit_select') {
        await handleEditSelect(interaction, selectedIndex, deploymentPoller, auditLogger);
    }
}

async function handleRemoveSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data: attendData, sha } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= attendData.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Remove section
        const removedSection = attendData.sections.splice(sectionIndex, 1)[0];

        const commitSha = await updateFileContent(
            FILE_PATH,
            attendData,
            sha,
            `Remove attend section: ${removedSection.heading}`
        );

        await interaction.reply({
            content: `✅ **Section Removed Successfully!**\n\n**Removed:** ${removedSection.heading}\n\n🚀 Deploying changes...`,
            flags: MessageFlags.Ephemeral
        });

        // Track deployment
        deploymentPoller.addPendingDeployment(
            interaction.user.id,
            interaction.channel.id,
            interaction,
            commitSha,
            interaction.user.username,
            "discord"
        );

        // Log audit
        await auditLogger.logSectionRemove(
            removedSection.heading,
            FILE_PATH,
            interaction.user.id,
            interaction.user.username
        );

    } catch (error) {
        console.error('Error removing attend section:', error);
        await interaction.reply({
            content: `❌ Error removing section: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleEditSelect(interaction, sectionIndex, deploymentPoller, auditLogger) {
    try {
        const { data } = await getFileContent(FILE_PATH);

        if (sectionIndex < 0 || sectionIndex >= data.sections.length) {
            await interaction.reply({
                content: '❌ Section not found.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const section = data.sections[sectionIndex];

        // Show modal for editing content
        const modal = new ModalBuilder()
            .setCustomId(`attend_edit_content_${Date.now()}`)
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
        interaction.client.pendingAttendSections = interaction.client.pendingAttendSections || new Map();
        interaction.client.pendingAttendSections.set(interaction.user.id, {
            heading: section.heading,
            index: sectionIndex.toString(),
            action: 'edit'
        });

    } catch (error) {
        console.error('Error in handleEditSelect:', error);
        await interaction.reply({
            content: `❌ Error reading section: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
