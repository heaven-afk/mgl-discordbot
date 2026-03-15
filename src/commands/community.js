const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const communityService = require('../services/communityService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('community')
        .setDescription('Community information hub')
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Show community info overview with quick-nav buttons'))
        .addSubcommand(sub =>
            sub.setName('rules')
                .setDescription('Show server rules and restrictions'))
        .addSubcommand(sub =>
            sub.setName('stream')
                .setDescription('Show stream information'))
        .addSubcommand(sub =>
            sub.setName('ranking')
                .setDescription('Show ranking information'))
        .addSubcommand(sub =>
            sub.setName('registration')
                .setDescription('Show registration guide and info'))
        .addSubcommand(sub =>
            sub.setName('transfer')
                .setDescription('Show transfer window information'))
        .addSubcommand(sub =>
            sub.setName('tier')
                .setDescription('Show tier placement information'))
        .addSubcommand(sub =>
            sub.setName('events')
                .setDescription('Show event format information'))
        .addSubcommand(sub =>
            sub.setName('weapons')
                .setDescription('Show banned weapons and restrictions'))
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Configure community info (Admin only)')
                .addStringOption(opt =>
                    opt.setName('category').setDescription('Category to configure').setRequired(true)
                        .addChoices(
                            { name: 'Rules', value: 'rules' },
                            { name: 'Banned Weapons', value: 'banned_weapons' },
                            { name: 'Registration', value: 'registration' },
                            { name: 'Stream', value: 'stream' },
                            { name: 'Ranking', value: 'ranking' },
                            { name: 'Transfer Window', value: 'transfer' },
                            { name: 'Tier Info', value: 'tier' },
                            { name: 'Event Format', value: 'event_format' }
                        ))
                .addStringOption(opt =>
                    opt.setName('content').setDescription('Main content text'))
                .addStringOption(opt =>
                    opt.setName('title').setDescription('Title override'))
                .addStringOption(opt =>
                    opt.setName('color').setDescription('Embed color hex (e.g. #3498DB)'))
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Associated channel'))
                .addStringOption(opt =>
                    opt.setName('deadline').setDescription('Deadline text (registration only)'))
                .addStringOption(opt =>
                    opt.setName('template').setDescription('Registration template text (registration only)'))
                .addChannelOption(opt =>
                    opt.setName('thread').setDescription('Registration thread/forum (registration only)'))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // Setup is admin-only
        if (sub === 'setup') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: '❌ You need `Manage Guild` permission to configure community info.',
                    ephemeral: true
                });
            }
            return this.handleSetup(interaction);
        }

        // Map subcommands to categories
        const categoryMap = {
            info: null,
            rules: 'rules',
            stream: 'stream',
            ranking: 'ranking',
            registration: 'registration',
            transfer: 'transfer',
            tier: 'tier',
            events: 'event_format',
            weapons: 'banned_weapons'
        };

        const category = categoryMap[sub];

        if (sub === 'info') {
            return this.handleInfo(interaction);
        }

        if (category) {
            return this.handleCategory(interaction, category);
        }
    },

    async handleInfo(interaction) {
        const embed = communityService.buildOverviewEmbed();
        const buttons = communityService.buildInfoButtons();

        await interaction.reply({
            embeds: [embed],
            components: buttons,
            ephemeral: false
        });
    },

    async handleCategory(interaction, category) {
        const embed = communityService.buildInfoEmbed(category);
        await interaction.reply({ embeds: [embed] });
    },

    async handleSetup(interaction) {
        const category = interaction.options.getString('category');
        const updates = {};

        const content = interaction.options.getString('content');
        if (content) updates.content = content;

        const title = interaction.options.getString('title');
        if (title) updates.title = title;

        const color = interaction.options.getString('color');
        if (color) updates.color = color;

        const channel = interaction.options.getChannel('channel');
        if (channel) updates.channelId = channel.id;

        // Registration-specific
        const deadline = interaction.options.getString('deadline');
        if (deadline) updates.deadline = deadline;

        const template = interaction.options.getString('template');
        if (template) updates.template = template;

        const thread = interaction.options.getChannel('thread');
        if (thread) updates.threadId = thread.id;

        if (Object.keys(updates).length === 0) {
            // Show current config for this category
            const embed = communityService.buildInfoEmbed(category);
            return interaction.reply({
                content: `📋 Current config for **${category}**:`,
                embeds: [embed],
                ephemeral: true
            });
        }

        try {
            updates.enabled = true;
            communityService.setInfo(category, updates);

            const changed = Object.keys(updates).filter(k => k !== 'enabled').join(', ');
            await interaction.reply({
                content: `✅ Updated **${category}** info: ${changed}`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    }
};
