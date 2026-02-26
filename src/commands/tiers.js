const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const permissionService = require('../services/permissionService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tiers')
        .setDescription('Display the moderation tier list and available commands'),

    async execute(interaction) {
        const config = permissionService.getAll();

        const embed = new EmbedBuilder()
            .setTitle('🔐 MGL 2026 Moderation Tier List')
            .setDescription('MGL 2026 Bot uses a tiered access system to ensure security and efficiency. Higher tiers grant access to more powerful tools.')
            .setColor('#5865F2')
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: 'Contact an Admin if you believe your tier should be upgraded.' });

        // Group commands by tier
        const tiers = { 1: [], 2: [], 3: [] };

        for (const [cmd, tier] of Object.entries(config.commandTiers)) {
            if (tiers[tier]) {
                tiers[tier].push(`\`/${cmd}\``);
            }
        }

        embed.addFields(
            {
                name: '🟦 Tier 1 — Light Access',
                value: `**Commands:** ${tiers[1].join(', ') || 'None'}\n*General utility and safe tools for the community.*`,
                inline: false
            },
            {
                name: '🟩 Tier 2 — Mid Access',
                value: `**Commands:** ${tiers[2].join(', ') || 'None'}\n*Moderate management tools for active moderators.*`,
                inline: false
            },
            {
                name: '🟥 Tier 3 — High Access',
                value: `**Commands:** ${tiers[3].join(', ') || 'None'}\n*Full experimental, administrative, and AI-powered tools.*`,
                inline: false
            }
        );

        embed.addFields({
            name: '✨ Note',
            value: 'Access is hierarchical. If you have Tier 3, you also have access to all Tier 2 and Tier 1 commands. Server Administrators automatically have High Access.'
        });

        await interaction.reply({ embeds: [embed] });
    }
};
