const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const stickyService = require('../services/stickyService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stickynote')
        .setDescription('Manage sticky notes')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a sticky note for this channel')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The message content')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Optional channel (defaults to current)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Show current persistent message for channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Optional channel (defaults to current)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Remove sticky note from channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Optional channel (defaults to current)'))),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: 'You need `Manage Messages` permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (!channel.isTextBased()) {
            return interaction.reply({ content: 'Target must be a text-based channel.', ephemeral: true });
        }

        if (subcommand === 'set') {
            const message = interaction.options.getString('message');
            await stickyService.setSticky(channel.id, message);
            await interaction.reply({ content: `Sticky note set for ${channel}. It will appear when new messages are sent.`, ephemeral: true });
        } else if (subcommand === 'show') {
            const note = stickyService.getSticky(channel.id);
            if (note) {
                await interaction.reply({ content: `**Current Sticky Note for ${channel}:**\n${note.content}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `No sticky note set for ${channel}.`, ephemeral: true });
            }
        } else if (subcommand === 'clear') {
            const success = stickyService.deleteSticky(channel.id);
            if (success) {
                await interaction.reply({ content: `Sticky note removed from ${channel}.`, ephemeral: true });
            } else {
                await interaction.reply({ content: `No sticky note found for ${channel}.`, ephemeral: true });
            }
        }
    },
};
