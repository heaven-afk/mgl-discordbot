const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const backupService = require('../services/backupService');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Backup channel messages')
        .addChannelOption(option =>
            option.setName('target')
                .setDescription('Channel to backup')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('format')
                .setDescription('Backup format')
                .addChoices({ name: 'JSON', value: 'json' })) // Only JSON for now as per plan
        .addStringOption(option =>
            option.setName('range')
                .setDescription('Range of messages')
                .addChoices(
                    { name: 'Last 100', value: '100' },
                    { name: 'Last 7 Days', value: '7d' },
                    { name: 'Last 30 Days', value: '30d' }
                )),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.editReply('You need `Manage Messages` permission.');
        }

        const target = interaction.options.getChannel('target');
        const range = interaction.options.getString('range') || '100';

        if (!target.isTextBased()) {
            return interaction.editReply('Target must be a text-based channel.');
        }

        try {
            await interaction.editReply('Generating backup... this may take a moment.');

            const { filePath, fileName, messageCount } = await backupService.createBackup(target, range, interaction.user);

            const attachment = new AttachmentBuilder(filePath, { name: fileName });

            // Try to DM first
            try {
                await interaction.user.send({
                    content: `Backup requested for ${target.name}. Found ${messageCount} messages.`,
                    files: [attachment]
                });
                await interaction.editReply('Backup sent to your DMs.');
            } catch (dmError) {
                // Fallback to channel
                await interaction.editReply({
                    content: `Could not send DM. Backup for ${target.name} (${messageCount} messages):`,
                    files: [attachment]
                });
            }

            // Clean up file after sending? 
            // Spec says "Storage Format: backups/", implies persistence. 
            // But for "Delivery Options", it implies sending.
            // I will keep it in storage as "Backup System" generally implies persistence.

        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to generate backup.');
        }
    },
};
