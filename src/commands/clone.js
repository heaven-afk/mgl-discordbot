const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const cloneService = require('../services/cloneService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clone')
        .setDescription('Duplicate a channel with its settings')
        .addChannelOption(option =>
            option.setName('source')
                .setDescription('Channel to clone')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name for the new channel (defaults to "channelname-clone")'))
        .addBooleanOption(option =>
            option.setName('clone_permissions')
                .setDescription('Copy permission settings (default: true)'))
        .addBooleanOption(option =>
            option.setName('clone_messages')
                .setDescription('Copy recent messages (default: false)'))
        .addIntegerOption(option =>
            option.setName('message_limit')
                .setDescription('Number of recent messages to copy (default: 50)')
                .setMinValue(1)
                .setMaxValue(100)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Permission check - requires Manage Channels
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.editReply('You need `Manage Channels` permission to use this command.');
        }

        const sourceChannel = interaction.options.getChannel('source');
        const newName = interaction.options.getString('name');
        const clonePermissions = interaction.options.getBoolean('clone_permissions') ?? true;
        const cloneMessages = interaction.options.getBoolean('clone_messages') ?? false;
        const messageLimit = interaction.options.getInteger('message_limit') ?? 50;

        try {
            await interaction.editReply(`Cloning channel **${sourceChannel.name}**...`);

            const newChannel = await cloneService.cloneChannel(
                sourceChannel,
                newName,
                clonePermissions,
                cloneMessages,
                messageLimit
            );

            await interaction.editReply(
                `✅ Successfully cloned **${sourceChannel.name}** to ${newChannel}!\n` +
                `${clonePermissions ? '✓ Permissions copied\n' : ''}` +
                `${cloneMessages ? `✓ Copied ${messageLimit} messages` : ''}`
            );
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to clone channel. Make sure the bot has proper permissions.');
        }
    },
};
