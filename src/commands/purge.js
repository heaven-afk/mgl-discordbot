const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const purgeService = require('../services/purgeService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk delete messages in a channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Only delete messages from this user'))
        .addBooleanOption(option =>
            option.setName('bots_only')
                .setDescription('Only delete bot messages'))
        .addStringOption(option =>
            option.setName('contains')
                .setDescription('Only delete messages containing this text')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.editReply('You need `Manage Messages` permission to use this command.');
        }

        const amount = interaction.options.getInteger('amount');
        const user = interaction.options.getUser('user');
        const botsOnly = interaction.options.getBoolean('bots_only') ?? false;
        const contains = interaction.options.getString('contains');

        const channel = interaction.channel;

        if (!channel.isTextBased()) {
            return interaction.editReply('This command can only be used in text channels.');
        }

        try {
            await interaction.editReply(`Searching for messages to delete...`);

            const messages = await purgeService.fetchMessagesToDelete(channel, {
                amount,
                user,
                botsOnly,
                contains
            });

            if (messages.length === 0) {
                return interaction.editReply('No messages found matching the criteria.');
            }

            await interaction.editReply(`Found ${messages.length} messages. Deleting...`);

            const deletedCount = await purgeService.deleteMessages(channel, messages);

            await interaction.editReply(`✅ Successfully deleted ${deletedCount} message(s).`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while purging messages.');
        }
    },
};
