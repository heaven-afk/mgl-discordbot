const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display a categorized list of all bot commands'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('<:MGLwhite:1405648585218982009> MGL 2026 Bot Commands')
            .setDescription('Here is a list of all available commands, categorized by functionality. Use `/` to see full details and options for each command.')
            .setColor('#2b2d31')
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

        // Category 1: General & Utility
        const generalCommands = [
            '🛠️ `/ping` — Check the bot\'s latency and uptime',
            '📊 `/stats` — Display server analytics and statistics',
            'ℹ️ `/help` — Display this list of all bot commands',
            '🛡️ `/tiers` — View information about the tiered permission system'
        ];
        embed.addFields({ name: '🔹 General & Utility', value: generalCommands.join('\n'), inline: false });

        // Category 2: Community Tools & Rich Messaging
        const communityCommands = [
            '🎨 `/embed` — Create a professional formatted rich embed message',
            '📌 `/sticky` — Manage persistent MGL sticky notes for channels',
            '📢 `/announce` — Post a structured announcement embed',
            '📣 `/announcement` — Manage and schedule announcements'
        ];
        embed.addFields({ name: '🔸 Community Tools & Messaging', value: communityCommands.join('\n'), inline: false });

        // Category 3: Data & Extraction
        const dataCommands = [
            '📥 `/extract` — Export a channel\'s messages based on filters (JSON/CSV)',
            '🖼️ `/media` — Download raw images/videos/audio from a channel as a ZIP',
            '📋 `/roster` — Scrape and export team registration data',
            '🔍 `/json` — Fetch and view the raw JSON object of a Discord message'
        ];
        embed.addFields({ name: '🔹 Data & Extraction', value: dataCommands.join('\n'), inline: false });

        // Category 4: AI Intelligence
        const aiCommands = [
            '🤖 `/smartreply` — Manually generate an AI-powered, context-aware reply',
            '⚙️ `/smart` — Configure AI assistant settings (triggers, cooldowns, persona)'
        ];
        embed.addFields({ name: '🧠 AI Intelligence', value: aiCommands.join('\n'), inline: false });

        // Category 5: Moderation & Administration
        const adminCommands = [
            '🎯 `/tierscan` — Admin tool to scan channels for tier change requests',
            '🔐 `/manage` — Manage tiered permissions (assign users/roles to tiers)',
            '🧹 `/purge` — Bulk delete messages with specific filters',
            '🚚 `/move` — Transfer messages or forum posts between channels/forums',
            '💾 `/backup` — Backup messages/threads',
            '📦 `/archive` — Archive channel content',
            '👯 `/clone` — Clone channel structure/settings'
        ];
        embed.addFields({ name: '🛡️ Moderation & Administration', value: adminCommands.join('\n'), inline: false });

        await interaction.reply({ embeds: [embed] });
    },
};
