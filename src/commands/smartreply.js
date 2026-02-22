const { SlashCommandBuilder } = require('discord.js');
const smartService = require('../services/smartService');
const smartConfig = require('../services/smartConfig');
const cooldownManager = require('../utils/cooldownManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('smartreply')
        .setDescription('Generate AI-powered context-aware reply')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Optional message to include in context'))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Target channel (defaults to current)'))
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Response mode')
                .addChoices(
                    { name: 'Reply', value: 'reply' },
                    { name: 'Suggest', value: 'suggest' },
                    { name: 'Summarize', value: 'summarize' },
                    { name: 'Actionable', value: 'actionable' }
                ))
        .addBooleanOption(option =>
            option.setName('private')
                .setDescription('Send response privately (default: true)'))
        .addStringOption(option =>
            option.setName('depth')
                .setDescription('Context depth')
                .addChoices(
                    { name: 'Light', value: 'light' },
                    { name: 'Standard', value: 'standard' },
                    { name: 'Deep', value: 'deep' }
                )),

    async execute(interaction) {
        const enabled = smartConfig.get('enabled');
        const manualAllowed = smartConfig.get('manual_allowed');

        // Check if manual replies are allowed
        if (!enabled && !manualAllowed) {
            return interaction.reply({
                content: 'Smart features are currently disabled.',
                ephemeral: true
            });
        }

        // Check cooldown
        const cooldownSeconds = smartConfig.get('cooldown_user');
        if (cooldownManager.isUserOnCooldown(interaction.user.id, cooldownSeconds)) {
            const remaining = cooldownManager.getRemainingCooldown(interaction.user.id, cooldownSeconds);
            return interaction.reply({
                content: `Please wait ${remaining} seconds before using this command again.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: interaction.options.getBoolean('private') ?? true });

        try {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const mode = interaction.options.getString('mode') || 'reply';
            const depth = interaction.options.getString('depth') || 'standard';
            const userMessage = interaction.options.getString('message');

            if (!channel.isTextBased()) {
                return interaction.editReply('Target must be a text-based channel.');
            }

            // Generate response
            const response = await smartService.generateResponse(channel, {
                mode,
                depth,
                userMessage
            });

            // Set cooldown
            cooldownManager.setUserCooldown(interaction.user.id);

            await interaction.editReply(response);
        } catch (error) {
            console.error('[SmartReply] Error:', error);
            await interaction.editReply(error.message || 'Failed to generate response.');
        }
    },
};
