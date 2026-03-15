const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const tierScanService = require('../services/tierScanService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tierscan')
        .setDescription('Scan channels for tier change requests')
        .addSubcommand(sub =>
            sub.setName('run')
                .setDescription('Scan for tier requests')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Specific channel to scan (omit for all configured)'))
                .addIntegerOption(opt =>
                    opt.setName('limit').setDescription('Max messages to scan (default: 100)').setMinValue(10).setMaxValue(500))
        )
        .addSubcommand(sub =>
            sub.setName('refresh')
                .setDescription('Rescan all configured channels for new requests')
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List scanned tier requests')
                .addStringOption(opt =>
                    opt.setName('status').setDescription('Filter by status')
                        .addChoices(
                            { name: 'Pending', value: 'pending' },
                            { name: 'Reviewed', value: 'reviewed' },
                            { name: 'Approved', value: 'approved' },
                            { name: 'Denied', value: 'denied' },
                            { name: 'All', value: 'all' }
                        ))
                .addIntegerOption(opt =>
                    opt.setName('page').setDescription('Page number').setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('mark-status')
                .setDescription('Update a tier request status')
                .addStringOption(opt =>
                    opt.setName('record_id').setDescription('Record ID (e.g. tsr_123456)').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('status').setDescription('New status').setRequired(true)
                        .addChoices(
                            { name: 'Pending', value: 'pending' },
                            { name: 'Reviewed', value: 'reviewed' },
                            { name: 'Approved', value: 'approved' },
                            { name: 'Denied', value: 'denied' }
                        ))
        )
        .addSubcommand(sub =>
            sub.setName('settings')
                .setDescription('Configure tier scan settings')
                .addChannelOption(opt =>
                    opt.setName('add_channel').setDescription('Add a channel to scan list'))
                .addChannelOption(opt =>
                    opt.setName('remove_channel').setDescription('Remove a channel from scan list'))
                .addChannelOption(opt =>
                    opt.setName('output_channel').setDescription('Set the output channel for scan results'))
                .addStringOption(opt =>
                    opt.setName('add_keyword').setDescription('Add a scan keyword'))
                .addStringOption(opt =>
                    opt.setName('remove_keyword').setDescription('Remove a scan keyword'))
                .addIntegerOption(opt =>
                    opt.setName('max_depth').setDescription('Max messages to scan per channel').setMinValue(10).setMaxValue(500))
        ),

    async execute(interaction) {
        // All tierscan subcommands require ManageGuild
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ You need `Manage Guild` permission to use tier scan.',
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'run': return this.handleRun(interaction);
            case 'refresh': return this.handleRefresh(interaction);
            case 'list': return this.handleList(interaction);
            case 'mark-status': return this.handleMarkStatus(interaction);
            case 'settings': return this.handleSettings(interaction);
        }
    },

    async handleRun(interaction) {
        const channel = interaction.options.getChannel('channel');
        const limit = interaction.options.getInteger('limit');

        await interaction.deferReply({ ephemeral: true });

        try {
            if (channel) {
                // Scan specific channel
                const records = await tierScanService.scanChannel(channel, limit);

                if (records.length === 0) {
                    return interaction.editReply(`🔍 Scanned <#${channel.id}> — no new tier requests found.`);
                }

                const embed = new EmbedBuilder()
                    .setTitle('🔍 Tier Scan Results')
                    .setColor('#2ECC71')
                    .setDescription(`Found **${records.length}** new tier request(s) in <#${channel.id}>`)
                    .setTimestamp();

                for (const record of records.slice(0, 5)) {
                    embed.addFields({
                        name: `${record.username} — ${record.teamName}`,
                        value: `Tier: ${record.currentTier} → ${record.requestedTier}\n[Jump](${record.jumpLink}) | ID: \`${record.id}\``,
                        inline: false
                    });
                }

                if (records.length > 5) {
                    embed.setFooter({ text: `+${records.length - 5} more. Use /tierscan list to see all.` });
                }

                await interaction.editReply({ embeds: [embed] });

                // Post to output channel if configured
                await this.postToOutput(interaction.client, records);
            } else {
                // Scan all configured channels
                const result = await tierScanService.scanAll(interaction.client);

                if (result.found === 0) {
                    return interaction.editReply(`🔍 Scanned ${result.scanned} channel(s) — no new tier requests found.`);
                }

                await interaction.editReply(
                    `✅ Scanned **${result.scanned}** channel(s), found **${result.found}** new tier request(s). Use \`/tierscan list\` to review.`
                );

                await this.postToOutput(interaction.client, result.records);
            }
        } catch (error) {
            console.error('[TierScan] Run error:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    async handleRefresh(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await tierScanService.scanAll(interaction.client);
            await interaction.editReply(
                `🔄 Refreshed **${result.scanned}** channel(s). Found **${result.found}** new tier request(s).`
            );

            if (result.found > 0) {
                await this.postToOutput(interaction.client, result.records);
            }
        } catch (error) {
            console.error('[TierScan] Refresh error:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    async handleList(interaction) {
        const statusFilter = interaction.options.getString('status') || 'all';
        const page = (interaction.options.getInteger('page') || 1) - 1;

        const filter = {};
        if (statusFilter !== 'all') filter.status = statusFilter;

        const records = tierScanService.getRecords(filter);
        const { embed, totalPages } = tierScanService.buildListEmbeds(records, page);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleMarkStatus(interaction) {
        const recordId = interaction.options.getString('record_id');
        const status = interaction.options.getString('status');

        try {
            const record = tierScanService.markStatus(recordId, status);

            const statusEmoji = { pending: '🟡', reviewed: '🔵', approved: '✅', denied: '❌' };

            await interaction.reply({
                content: `${statusEmoji[status]} Updated \`${recordId}\` → **${status.toUpperCase()}** (${record.username} — ${record.teamName})`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    },

    async handleSettings(interaction) {
        const addChannel = interaction.options.getChannel('add_channel');
        const removeChannel = interaction.options.getChannel('remove_channel');
        const outputChannel = interaction.options.getChannel('output_channel');
        const addKeyword = interaction.options.getString('add_keyword');
        const removeKeyword = interaction.options.getString('remove_keyword');
        const maxDepth = interaction.options.getInteger('max_depth');

        const changes = [];

        if (addChannel) {
            tierScanService.addScanChannel(addChannel.id);
            changes.push(`Added <#${addChannel.id}> to scan list`);
        }

        if (removeChannel) {
            tierScanService.removeScanChannel(removeChannel.id);
            changes.push(`Removed <#${removeChannel.id}> from scan list`);
        }

        if (outputChannel) {
            tierScanService.updateConfig({ outputChannel: outputChannel.id });
            changes.push(`Output channel set to <#${outputChannel.id}>`);
        }

        if (addKeyword) {
            const config = tierScanService.getConfig();
            if (!config.keywords.includes(addKeyword.toLowerCase())) {
                config.keywords.push(addKeyword.toLowerCase());
                tierScanService.updateConfig({ keywords: config.keywords });
                changes.push(`Added keyword: \`${addKeyword}\``);
            }
        }

        if (removeKeyword) {
            const config = tierScanService.getConfig();
            config.keywords = config.keywords.filter(k => k !== removeKeyword.toLowerCase());
            tierScanService.updateConfig({ keywords: config.keywords });
            changes.push(`Removed keyword: \`${removeKeyword}\``);
        }

        if (maxDepth) {
            tierScanService.updateConfig({ maxScanDepth: maxDepth });
            changes.push(`Max scan depth: ${maxDepth}`);
        }

        if (changes.length === 0) {
            // Show current settings
            const config = tierScanService.getConfig();
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Tier Scan Settings')
                .setColor('#5865F2')
                .addFields(
                    { name: 'Enabled', value: config.enabled ? '✅' : '❌', inline: true },
                    { name: 'Max Depth', value: config.maxScanDepth.toString(), inline: true },
                    { name: 'Output Channel', value: config.outputChannel ? `<#${config.outputChannel}>` : 'Not set', inline: true },
                    { name: 'Scan Channels', value: config.scanChannels.length > 0 ? config.scanChannels.map(id => `<#${id}>`).join('\n') : 'None configured' },
                    { name: 'Keywords', value: config.keywords.slice(0, 10).map(k => `\`${k}\``).join(', ') || 'None' }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.reply({
            content: `✅ Settings updated:\n${changes.map(c => `• ${c}`).join('\n')}`,
            ephemeral: true
        });
    },

    async postToOutput(client, records) {
        const config = tierScanService.getConfig();
        if (!config.outputChannel || records.length === 0) return;

        try {
            const channel = await client.channels.fetch(config.outputChannel).catch(() => null);
            if (!channel) return;

            for (const record of records.slice(0, 10)) {
                const embed = tierScanService.buildRecordEmbed(record);
                await channel.send({ embeds: [embed] });
            }

            if (records.length > 10) {
                await channel.send({
                    content: `*+${records.length - 10} more tier requests. Use \`/tierscan list\` to see all.*`
                });
            }
        } catch (error) {
            console.error('[TierScan] Error posting to output:', error);
        }
    }
};
