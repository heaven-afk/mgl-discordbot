const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const archiveService = require('../services/archiveService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('archive')
        .setDescription('Export entire channel history (no message limit)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to archive')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('format')
                .setDescription('Archive format')
                .addChoices({ name: 'JSON', value: 'json' })),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.editReply('You need `Manage Messages` permission.');
        }

        const channel = interaction.options.getChannel('channel');
        const format = interaction.options.getString('format') || 'json';

        if (!channel.isTextBased()) {
            return interaction.editReply('Target must be a text-based channel.');
        }

        try {
            await interaction.editReply('Creating full archive... this may take several minutes for large channels.');

            const { filePath, fileName, messageCount } = await archiveService.createArchive(
                channel,
                format,
                interaction.user
            );

            const attachment = new AttachmentBuilder(filePath, { name: fileName });

            // Try DM first
            try {
                await interaction.user.send({
                    content: `Full archive of **${channel.name}** completed.\nTotal messages: **${messageCount}**`,
                    files: [attachment]
                });
                await interaction.editReply('Archive sent to your DMs.');
            } catch (dmError) {
                // Fallback to channel
                await interaction.editReply({
                    content: `Could not send DM. Archive of **${channel.name}** (${messageCount} messages):`,
                    files: [attachment]
                });
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to create archive.');
        }
    },
};
