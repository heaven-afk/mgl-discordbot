const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const smartConfig = require('../services/smartConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('smart')
        .setDescription('Configure smart AI features')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Update smart feature settings')
                .addStringOption(option =>
                    option.setName('enabled')
                        .setDescription('Master switch')
                        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
                .addStringOption(option =>
                    option.setName('auto')
                        .setDescription('Auto assistant toggle')
                        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
                .addStringOption(option =>
                    option.setName('manual_allowed')
                        .setDescription('Allow /smartreply when disabled')
                        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
                .addStringOption(option =>
                    option.setName('memory')
                        .setDescription('Memory mode')
                        .addChoices({ name: 'Off', value: 'off' }, { name: 'Summaries', value: 'summaries' }))
                .addStringOption(option =>
                    option.setName('persona')
                        .setDescription('Bot personality')
                        .addChoices(
                            { name: 'Default', value: 'default' },
                            { name: 'Pirate', value: 'pirate' },
                            { name: 'Sarcastic', value: 'sarcastic' },
                            { name: 'Helpful', value: 'helpful' },
                            { name: 'Professional', value: 'professional' },
                            { name: 'UwU', value: 'uwu' }
                        ))
                .addStringOption(option =>
                    option.setName('system_prompt')
                        .setDescription('Override system prompt (Admin only)'))
                .addIntegerOption(option =>
                    option.setName('context_limit')
                        .setDescription('Number of recent messages to include')
                        .setMinValue(5)
                        .setMaxValue(50))
                .addIntegerOption(option =>
                    option.setName('cooldown_user')
                        .setDescription('User cooldown in seconds')
                        .setMinValue(5)
                        .setMaxValue(300))
                .addIntegerOption(option =>
                    option.setName('cooldown_channel')
                        .setDescription('Channel cooldown in seconds')
                        .setMinValue(5)
                        .setMaxValue(300))
                .addIntegerOption(option =>
                    option.setName('cooldown_auto_user')
                        .setDescription('Auto mode user cooldown in seconds')
                        .setMinValue(10)
                        .setMaxValue(600)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('allow')
                .setDescription('Add channel to allow list')
                .addChannelOption(option =>
                    option.setName('target')
                        .setDescription('Channel to allow')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('block')
                .setDescription('Add channel to block list')
                .addChannelOption(option =>
                    option.setName('target')
                        .setDescription('Channel to block')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('triggers')
                .setDescription('Configure auto-response triggers')
                .addStringOption(option =>
                    option.setName('mention')
                        .setDescription('Respond when bot is mentioned')
                        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
                .addStringOption(option =>
                    option.setName('reply_to_bot')
                        .setDescription('Respond when users reply to bot messages')
                        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
                .addStringOption(option =>
                    option.setName('prefix')
                        .setDescription('Prefix to trigger response (or "off")'))
                .addStringOption(option =>
                    option.setName('keywords')
                        .setDescription('Comma-separated keywords (or "off")')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Display current configuration')),

    async execute(interaction) {
        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'You need `Manage Guild` permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            return this.handleSet(interaction);
        } else if (subcommand === 'allow') {
            return this.handleAllow(interaction);
        } else if (subcommand === 'block') {
            return this.handleBlock(interaction);
        } else if (subcommand === 'triggers') {
            return this.handleTriggers(interaction);
        } else if (subcommand === 'list') {
            return this.handleList(interaction);
        }
    },

    async handleSet(interaction) {
        const updates = {};

        const enabled = interaction.options.getString('enabled');
        if (enabled) updates.enabled = enabled === 'on';

        const auto = interaction.options.getString('auto');
        if (auto) updates.auto = auto === 'on';

        const manualAllowed = interaction.options.getString('manual_allowed');
        if (manualAllowed) updates.manual_allowed = manualAllowed === 'on';

        const memory = interaction.options.getString('memory');
        if (memory) updates.memory = memory;

        const contextLimit = interaction.options.getInteger('context_limit');
        if (contextLimit) updates.context_limit = contextLimit;

        const cooldownUser = interaction.options.getInteger('cooldown_user');
        if (cooldownUser) updates.cooldown_user = cooldownUser;

        const cooldownChannel = interaction.options.getInteger('cooldown_channel');
        if (cooldownChannel) updates.cooldown_channel = cooldownChannel;

        const cooldownAutoUser = interaction.options.getInteger('cooldown_auto_user');
        if (cooldownAutoUser) updates.cooldown_auto_user = cooldownAutoUser;

        const persona = interaction.options.getString('persona');
        if (persona) updates.persona = persona;

        const systemPrompt = interaction.options.getString('system_prompt');
        if (systemPrompt) updates.system_prompt_override = systemPrompt;

        if (Object.keys(updates).length === 0) {
            return interaction.reply({
                content: 'No settings specified.',
                ephemeral: true
            });
        }

        smartConfig.update(updates);

        const summary = Object.entries(updates)
            .map(([key, value]) => `• ${key}: ${value}`)
            .join('\n');

        await interaction.reply({
            content: `✅ Updated settings:\n${summary}`,
            ephemeral: true
        });
    },

    async handleAllow(interaction) {
        const channel = interaction.options.getChannel('target');
        smartConfig.addToAllowList(channel.id);

        await interaction.reply({
            content: `✅ Added ${channel} to allow list.`,
            ephemeral: true
        });
    },

    async handleBlock(interaction) {
        const channel = interaction.options.getChannel('target');
        smartConfig.addToBlockList(channel.id);

        await interaction.reply({
            content: `✅ Added ${channel} to block list.`,
            ephemeral: true
        });
    },

    async handleTriggers(interaction) {
        const updates = {};

        const mention = interaction.options.getString('mention');
        if (mention) updates.mention = mention === 'on';

        const replyToBot = interaction.options.getString('reply_to_bot');
        if (replyToBot) updates.reply_to_bot = replyToBot === 'on';

        const prefix = interaction.options.getString('prefix');
        if (prefix !== null) updates.prefix = prefix;

        const keywords = interaction.options.getString('keywords');
        if (keywords !== null) updates.keywords = keywords;

        if (Object.keys(updates).length === 0) {
            return interaction.reply({
                content: 'No triggers specified.',
                ephemeral: true
            });
        }

        smartConfig.updateTriggers(updates);

        const summary = Object.entries(updates)
            .map(([key, value]) => `• ${key}: ${value}`)
            .join('\n');

        await interaction.reply({
            content: `✅ Updated triggers:\n${summary}`,
            ephemeral: true
        });
    },

    async handleList(interaction) {
        const config = smartConfig.getAll();

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖 Smart AI Configuration')
            .addFields(
                { name: 'Master Switch', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Auto Mode', value: config.auto ? '✅ On' : '❌ Off', inline: true },
                { name: 'Manual Allowed', value: config.manual_allowed ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Memory', value: config.memory, inline: true },
                { name: 'Context Limit', value: config.context_limit.toString(), inline: true },
                { name: 'User Cooldown', value: `${config.cooldown_user}s`, inline: true },
                { name: 'Channel Cooldown', value: `${config.cooldown_channel}s`, inline: true },
                { name: 'Auto User Cooldown', value: `${config.cooldown_auto_user}s`, inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                {
                    name: '🎯 Triggers', value:
                        `Mention: ${config.triggers.mention ? '✅' : '❌'}\n` +
                        `Reply to Bot: ${config.triggers.reply_to_bot ? '✅' : '❌'}\n` +
                        `Prefix: ${config.triggers.prefix}\n` +
                        `Keywords: ${config.triggers.keywords}`
                },
                {
                    name: '📋 Lists', value:
                        `Allow List: ${config.allow_list.length} channels\n` +
                        `Block List: ${config.block_list.length} channels`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
