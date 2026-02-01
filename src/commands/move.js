const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const messageMover = require('../services/messageMover');
const { isValidLimit } = require('../utils/validators');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Transfer messages from one channel to another')
        .addChannelOption(option =>
            option.setName('source')
                .setDescription('Source channel/thread')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('destination')
                .setDescription('Destination channel/thread')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of messages to move (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('after_message_id')
                .setDescription('Start moving messages after this message ID'))
        .addBooleanOption(option =>
            option.setName('include_bots')
                .setDescription('Include bot messages?'))
        .addBooleanOption(option =>
            option.setName('delete_original')
                .setDescription('Delete original messages? (Requires Manage Messages)'))
        .addBooleanOption(option =>
            option.setName('keep_author_context')
                .setDescription('Add "Originally sent by" header? (Default: true)')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const source = interaction.options.getChannel('source');
        const destination = interaction.options.getChannel('destination');
        const limit = interaction.options.getInteger('limit');
        const afterId = interaction.options.getString('after_message_id');
        const includeBots = interaction.options.getBoolean('include_bots') ?? false;
        const deleteOriginal = interaction.options.getBoolean('delete_original') ?? false;
        const keepAuthorContext = interaction.options.getBoolean('keep_author_context') ?? true;

        // Checks
        if (!source.isTextBased()) {
            return interaction.editReply('Source must be a text-based channel.');
        }
        if (!destination.isTextBased()) {
            return interaction.editReply('Destination must be a text-based channel.');
        }
        if (source.id === destination.id) {
            return interaction.editReply('Source and destination cannot be the same.');
        }

        // Permission Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.editReply('You need `Manage Messages` permission to use this command.');
        }

        try {
            const messages = await messageMover.fetchMessages(source, limit, afterId);

            if (messages.length === 0) {
                return interaction.editReply('No messages found to move.');
            }

            await interaction.editReply(`Found ${messages.length} messages. Starting transfer...`);

            const movedCount = await messageMover.moveMessages({
                source,
                destination,
                messages,
                includeBots,
                deleteOriginal,
                keepAuthorContext
            }, interaction);

            await interaction.editReply(`Successfully moved ${movedCount} messages from ${source} to ${destination}.`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred during the transfer.');
        }
    },
};
