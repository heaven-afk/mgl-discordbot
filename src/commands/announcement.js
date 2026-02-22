const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const announcementConfig = require('../config/announcementConfig.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Manage announcement system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Turn the system on or off')
                .addStringOption(option =>
                    option.setName('state')
                        .setDescription('Select state')
                        .setRequired(true)
                        .addChoices(
                            { name: 'ON', value: 'on' },
                            { name: 'OFF', value: 'off' }
                        ))),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '⛔ Administrator permission required.',
                ephemeral: true
            });
        }

        const state = interaction.options.getString('state');
        const isEnabled = state === 'on';

        // Update config object
        announcementConfig.enabled = isEnabled;

        // Write to file
        const configPath = path.join(__dirname, '../config/announcementConfig.json');
        try {
            fs.writeFileSync(configPath, JSON.stringify(announcementConfig, null, 2));

            await interaction.reply({
                content: `✅ Announcement system is now **${state.toUpperCase()}**.`
            });
        } catch (error) {
            console.error('Config Write Error:', error);
            await interaction.reply({
                content: '❌ Failed to save configuration change.',
                ephemeral: true
            });
        }
    },
};
