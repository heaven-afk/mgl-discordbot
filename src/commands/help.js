const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display a categorized list of all bot commands'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 MGL 2026 Bot Commands')
            .setDescription('Here is a list of all available commands, categorized by functionality. Use `/` to see full details and options for each command.')
            .setColor('#2b2d31')
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

        // Category 1: General & Utility (Safe for everyone)
        const generalCommands = [
            '`/ping` — Check the bot\'s latency and uptime',
            '`/stats` — Display server analytics and statistics',
            '`/embed` — Create a professional formatted rich embed message',
            '`/stickynote` — Manage persistent sticky notes for channels'
        ];
        embed.addFields({ name: '🟦 General & Utility', value: generalCommands.join('\n'), inline: false });

        // Category 2: Data Extraction & Scraping (Safe/Moderate)
        const dataCommands = [
            '`/extract` — Export a channel\'s messages based on filters (JSON/CSV)',
            '`/media` — Download raw images/videos/audio from a channel as a ZIP',
            '`/roster` — Scrape and export team registration data'
        ];
        embed.addFields({ name: '🟩 Data & Extraction', value: dataCommands.join('\n'), inline: false });

        // Category 3: Smart AI Assistant (Moderate)
        const aiCommands = [
            '`/smartreply` — Manually generate an AI-powered, context-aware reply',
            '`/smart` — [Classified — Contact Developer]'
        ];
        embed.addFields({ name: '🟪 AI Intelligence', value: aiCommands.join('\n'), inline: false });

        // Category 4: Moderation & Administration (Risky/Classified)
        const adminCommands = [
            '`/announce` — Post a structured announcement embed',
            '`/announcement` — [Classified — Contact Developer]',
            '`/move` — [Classified — Contact Developer]',
            '`/purge` — [Classified — Contact Developer]',
            '`/backup` — [Classified — Contact Developer]',
            '`/archive` — [Classified — Contact Developer]',
            '`/clone` — [Classified — Contact Developer]'
        ];
        embed.addFields({ name: '🟥 System & Admin', value: adminCommands.join('\n'), inline: false });

        await interaction.reply({ embeds: [embed] });
    },
};
