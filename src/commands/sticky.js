const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const stickyService = require('../services/stickyService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Manage sticky notes (persistent channel messages)')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a sticky note in a channel')
                .addStringOption(opt =>
                    opt.setName('content').setDescription('The sticky note content').setRequired(true))
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Target channel (defaults to current)'))
                .addStringOption(opt =>
                    opt.setName('mode').setDescription('Output mode')
                        .addChoices(
                            { name: 'Embed', value: 'embed' },
                            { name: 'Text', value: 'text' }
                        ))
                .addStringOption(opt =>
                    opt.setName('title').setDescription('Embed title (embed mode only)'))
                .addStringOption(opt =>
                    opt.setName('color').setDescription('Embed color hex (e.g. #FFFF00)'))
                .addIntegerOption(opt =>
                    opt.setName('repost_after').setDescription('Repost after X messages (default: 1)').setMinValue(1).setMaxValue(50))
                .addIntegerOption(opt =>
                    opt.setName('repost_interval').setDescription('Repost interval in minutes (optional)').setMinValue(1).setMaxValue(1440))
        )
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Edit an existing sticky note')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Channel with the sticky (defaults to current)'))
                .addStringOption(opt =>
                    opt.setName('content').setDescription('New content'))
                .addStringOption(opt =>
                    opt.setName('title').setDescription('New embed title'))
                .addStringOption(opt =>
                    opt.setName('color').setDescription('New embed color hex'))
                .addIntegerOption(opt =>
                    opt.setName('repost_after').setDescription('New repost threshold').setMinValue(1).setMaxValue(50))
                .addIntegerOption(opt =>
                    opt.setName('repost_interval').setDescription('New repost interval (minutes)').setMinValue(1).setMaxValue(1440))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Remove a sticky note from a channel')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Channel to clear (defaults to current)'))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all active sticky notes')
        )
        .addSubcommand(sub =>
            sub.setName('toggle')
                .setDescription('Enable or disable a sticky note')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Channel to toggle (defaults to current)'))
        )
        .addSubcommand(sub =>
            sub.setName('preview')
                .setDescription('Preview a sticky note')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Channel to preview (defaults to current)'))
        ),

    async execute(interaction) {
        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '❌ You need `Manage Messages` permission.',
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'create': return this.handleCreate(interaction);
            case 'edit': return this.handleEdit(interaction);
            case 'delete': return this.handleDelete(interaction);
            case 'list': return this.handleList(interaction);
            case 'toggle': return this.handleToggle(interaction);
            case 'preview': return this.handlePreview(interaction);
        }
    },

    async handleCreate(interaction) {
        const content = interaction.options.getString('content');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const outputMode = interaction.options.getString('mode') || 'embed';
        const title = interaction.options.getString('title') || '<:mgl_logo:1234567890> MGL Sticky Note';
        const color = interaction.options.getString('color') || '#FFFF00';
        const repostThreshold = interaction.options.getInteger('repost_after') || 1;
        const repostInterval = interaction.options.getInteger('repost_interval') || null;

        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ Target must be a text-based channel.', ephemeral: true });
        }

        // Check if sticky already exists
        if (stickyService.getSticky(channel.id)) {
            return interaction.reply({
                content: `⚠️ A sticky note already exists in <#${channel.id}>. Use \`/sticky edit\` to modify it or \`/sticky delete\` to remove it first.`,
                ephemeral: true
            });
        }

        await stickyService.createSticky(channel.id, {
            content,
            outputMode,
            title,
            color,
            repostThreshold,
            repostInterval
        });

        const embed = new EmbedBuilder()
            .setTitle('<:mgl_logo:1234567890> MGL Sticky Note Created')
            .setColor('#2ECC71')
            .addFields(
                { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                { name: 'Mode', value: outputMode, inline: true },
                { name: 'Repost After', value: `${repostThreshold} message(s)`, inline: true }
            )
            .setTimestamp();

        if (repostInterval) {
            embed.addFields({ name: 'Repost Interval', value: `${repostInterval} min`, inline: true });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleEdit(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const updates = {};

        const content = interaction.options.getString('content');
        if (content) updates.content = content;

        const title = interaction.options.getString('title');
        const color = interaction.options.getString('color');
        if (title || color) {
            const existing = stickyService.getSticky(channel.id);
            if (existing) {
                updates.embedSettings = { ...existing.embedSettings };
                if (title) updates.embedSettings.title = title;
                if (color) updates.embedSettings.color = color;
            }
        }

        const repostThreshold = interaction.options.getInteger('repost_after');
        if (repostThreshold) updates.repostThreshold = repostThreshold;

        const repostInterval = interaction.options.getInteger('repost_interval');
        if (repostInterval) updates.repostInterval = repostInterval;

        if (Object.keys(updates).length === 0) {
            return interaction.reply({ content: '❌ No changes specified.', ephemeral: true });
        }

        try {
            stickyService.updateSticky(channel.id, updates);
            await interaction.reply({
                content: `✅ Updated sticky note in <#${channel.id}>: ${Object.keys(updates).join(', ')}`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    },

    async handleDelete(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (stickyService.deleteSticky(channel.id)) {
            await interaction.reply({
                content: `✅ Sticky note removed from <#${channel.id}>.`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ No sticky note found in <#${channel.id}>.`,
                ephemeral: true
            });
        }
    },

    async handleList(interaction) {
        const stickies = stickyService.listAllStickies();

        if (stickies.length === 0) {
            return interaction.reply({ content: 'No sticky notes configured.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`<:mgl_logo:1234567890> All MGL Sticky Notes (${stickies.length})`)
            .setColor('#FFFF00')
            .setTimestamp();

        for (const sticky of stickies.slice(0, 15)) {
            const status = sticky.active ? '✅' : '❌';
            const preview = sticky.content.length > 60
                ? sticky.content.substring(0, 60) + '...'
                : sticky.content;

            embed.addFields({
                name: `${status} <#${sticky.channelId}>`,
                value: `**Mode:** ${sticky.outputMode} | **Repost:** ${sticky.repostThreshold} msgs\n\`${preview}\``,
                inline: false
            });
        }

        if (stickies.length > 15) {
            embed.setFooter({ text: `+${stickies.length - 15} more sticky notes` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleToggle(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            const active = stickyService.toggleSticky(channel.id);
            await interaction.reply({
                content: `${active ? '✅' : '❌'} Sticky note in <#${channel.id}> is now **${active ? 'enabled' : 'disabled'}**.`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    },

    async handlePreview(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            const payload = stickyService.previewSticky(channel.id);
            payload.ephemeral = true;
            payload.content = `<:mgl_logo:1234567890> **Preview** of sticky in <#${channel.id}>:\n${payload.content || ''}`;
            await interaction.reply(payload);
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    }
};
