const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const extractService = require('../services/extractService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('extract')
        .setDescription('Advanced message extraction and export')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new extraction job')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('Channel to extract from (default: current)'))
                .addIntegerOption(option =>
                    option.setName('limit').setDescription('Max messages to check (default: 1000)').setMinValue(1).setMaxValue(20000))
                .addStringOption(option =>
                    option.setName('format').setDescription('Output format').addChoices(
                        { name: 'JSON', value: 'json' },
                        { name: 'CSV', value: 'csv' },
                        { name: 'Text', value: 'txt' }
                    ))
                .addStringOption(option =>
                    option.setName('query').setDescription('Filter by keyword (contains)'))
                .addUserOption(option =>
                    option.setName('user').setDescription('Filter by user'))
                .addStringOption(option =>
                    option.setName('from_date').setDescription('YYYY-MM-DD start date'))
                .addStringOption(option =>
                    option.setName('to_date').setDescription('YYYY-MM-DD end date'))
                .addBooleanOption(option =>
                    option.setName('include_bots').setDescription('Include bot messages? (default: false)'))
                .addBooleanOption(option =>
                    option.setName('attachments_only').setDescription('Only messages with attachments?'))
                .addBooleanOption(option =>
                    option.setName('links_only').setDescription('Only messages with links?'))
                .addBooleanOption(option =>
                    option.setName('anonymize').setDescription('Anonymize user IDs and names?'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel your active extraction job')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check status of your active job')
        ),

    async execute(interaction) {
        // PERMISSION CHECK
        const hasManageMessages = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        const extractRole = process.env.EXTRACT_ROLE_ID;
        const hasRole = extractRole && interaction.member.roles.cache.has(extractRole);

        if (!hasManageMessages && !hasRole) {
            return interaction.reply({
                content: `⛔ You need \`Manage Messages\` permission${extractRole ? ' or the Extract Role' : ''} to use this command.`,
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            // Bot permission check
            const botPerms = channel.permissionsFor(interaction.client.user);
            if (!botPerms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
                return interaction.reply({
                    content: `⛔ I don't have permission to view or read messages in ${channel}.`,
                    ephemeral: true
                });
            }

            const options = {
                channel: channel,
                limit: interaction.options.getInteger('limit') || 1000,
                format: interaction.options.getString('format') || 'json',
                query: interaction.options.getString('query'),
                user: interaction.options.getUser('user'),
                includeBots: interaction.options.getBoolean('include_bots') || false,
                attachmentsOnly: interaction.options.getBoolean('attachments_only') || false,
                linksOnly: interaction.options.getBoolean('links_only') || false,
                anonymize: interaction.options.getBoolean('anonymize') || false,
            };

            // Date parsing
            const fromDateStr = interaction.options.getString('from_date');
            if (fromDateStr) {
                const date = new Date(fromDateStr);
                if (isNaN(date.getTime())) return interaction.reply({ content: '❌ Invalid from_date format. Use YYYY-MM-DD.', ephemeral: true });
                options.fromDate = date.getTime();
            }

            const toDateStr = interaction.options.getString('to_date');
            if (toDateStr) {
                const date = new Date(toDateStr);
                if (isNaN(date.getTime())) return interaction.reply({ content: '❌ Invalid to_date format. Use YYYY-MM-DD.', ephemeral: true });
                options.toDate = date.getTime();
            }

            try {
                // Ensure no existing job
                if (extractService.getJobStatus(interaction.user.id)) {
                    return interaction.reply({ content: '⚠️ You already have a job running. Use `/extract cancel` or wait.', ephemeral: true });
                }

                await extractService.startJob(interaction, options);
                // Initial reply is handled inside startJob to ensure we have the job ID
            } catch (error) {
                if (!interaction.replied) {
                    await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
                }
            }

        } else if (subcommand === 'cancel') {
            const result = extractService.cancelJob(interaction.user.id);
            if (result) {
                await interaction.reply({ content: '✅ Job cancelled.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'You have no active jobs.', ephemeral: true });
            }

        } else if (subcommand === 'status') {
            const job = extractService.getJobStatus(interaction.user.id);
            if (!job) {
                await interaction.reply({ content: 'No active jobs.', ephemeral: true });
            } else {
                const progress = Math.round((job.stats.fetched / job.options.limit) * 100); // Rough estimate based on limit
                await interaction.reply({
                    content: `**Job Status:** ${job.status.toUpperCase()}\n` +
                        `Target: ${job.channel}\n` +
                        `Fetched: ${job.stats.fetched} messages\n` +
                        `Kept: ${job.stats.kept}\n` +
                        `Oldest Reached: ${job.stats.oldestMessageDate ? job.stats.oldestMessageDate.toISOString().split('T')[0] : 'Scanning...'}`,
                    ephemeral: true
                });
            }
        }
    }
};
