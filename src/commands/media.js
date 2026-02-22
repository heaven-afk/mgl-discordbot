const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const mediaService = require('../services/mediaService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('media')
        .setDescription('Download raw media (images, videos, etc.) from channels in ZIP bundles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('scrape')
                .setDescription('Start a new media extraction job')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('Channel to extract from (default: current)'))
                .addIntegerOption(option =>
                    option.setName('limit').setDescription('Max messages to scan (default: 500)').setMinValue(1).setMaxValue(5000))
                .addStringOption(option =>
                    option.setName('type').setDescription('Filter by media type (default: all)').addChoices(
                        { name: 'All Media', value: 'all' },
                        { name: 'Images Only', value: 'image' },
                        { name: 'Videos Only', value: 'video' },
                        { name: 'Audio/Voice Only', value: 'audio' }
                    ))
                .addBooleanOption(option =>
                    option.setName('include_threads').setDescription('Extract from threads in this channel? (default: false)'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel your active media extraction job')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check status of your active media extraction job')
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

        if (subcommand === 'scrape') {
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
                limit: interaction.options.getInteger('limit') || 500,
                type: interaction.options.getString('type') || 'all',
                includeThreads: interaction.options.getBoolean('include_threads') || false
            };

            // If the target is a Forum Channel, we absolutely must include threads because forums have no base messages
            if (channel.type === 15) { // 15 is GuildForum
                options.includeThreads = true;
            }

            try {
                // Ensure no existing job
                if (mediaService.getJobStatus(interaction.user.id)) {
                    return interaction.reply({ content: '⚠️ You already have a media extraction job running. Use `/media cancel` or wait.', ephemeral: true });
                }

                await mediaService.startJob(interaction, options);
            } catch (error) {
                if (!interaction.replied) {
                    await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
                }
            }

        } else if (subcommand === 'cancel') {
            const result = mediaService.cancelJob(interaction.user.id);
            if (result) {
                await interaction.reply({ content: '✅ Job cancelled.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'You have no active jobs.', ephemeral: true });
            }

        } else if (subcommand === 'status') {
            const job = mediaService.getJobStatus(interaction.user.id);
            if (!job) {
                await interaction.reply({ content: 'No active jobs.', ephemeral: true });
            } else {
                await interaction.reply({
                    content: `**Job Status:** ${job.status.toUpperCase()}\n` +
                        `Target: ${job.channel}\n` +
                        `Checked: ${job.stats.processed} messages\n` +
                        `Downloaded: ${job.stats.filesDownloaded} files (${(job.stats.totalBytes / 1024 / 1024).toFixed(2)} MB)\n` +
                        `ZIPs Sent: ${job.stats.zipsSent}\n` +
                        `Oldest Reached: ${job.stats.oldestMessageDate ? job.stats.oldestMessageDate.toISOString().split('T')[0] : 'Scanning...'}`,
                    ephemeral: true
                });
            }
        }
    }
};
