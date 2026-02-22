const { EmbedBuilder } = require('discord.js');

/**
 * Service to gather and format server statistics
 */
class StatsService {
    /**
     * Get server overview statistics
     * @param {import('discord.js').Guild} guild 
     */
    async getOverviewStats(guild) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${guild.name} - Server Overview`)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: '👥 Total Members', value: guild.memberCount.toString(), inline: true },
                { name: '💬 Text Channels', value: guild.channels.cache.filter(c => c.isTextBased()).size.toString(), inline: true },
                { name: '🔊 Voice Channels', value: guild.channels.cache.filter(c => c.isVoiceBased()).size.toString(), inline: true },
                { name: '📁 Categories', value: guild.channels.cache.filter(c => c.type === 4).size.toString(), inline: true },
                { name: '🎭 Roles', value: guild.roles.cache.size.toString(), inline: true },
                { name: '😀 Emojis', value: guild.emojis.cache.size.toString(), inline: true },
                { name: '⚡ Boost Level', value: `Level ${guild.premiumTier}`, inline: true },
                { name: '💎 Boosts', value: guild.premiumSubscriptionCount?.toString() || '0', inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: `Server ID: ${guild.id}` })
            .setTimestamp();

        return embed;
    }

    /**
     * Get channel statistics
     * @param {import('discord.js').Guild} guild 
     */
    async getChannelStats(guild) {
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.isTextBased());
        const voiceChannels = channels.filter(c => c.isVoiceBased());
        const categories = channels.filter(c => c.type === 4);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📁 ${guild.name} - Channel Statistics`)
            .addFields(
                { name: '💬 Text Channels', value: textChannels.size.toString(), inline: true },
                { name: '🔊 Voice Channels', value: voiceChannels.size.toString(), inline: true },
                { name: '📁 Categories', value: categories.size.toString(), inline: true },
                { name: '📢 Announcement Channels', value: channels.filter(c => c.type === 5).size.toString(), inline: true },
                { name: '🧵 Forum Channels', value: channels.filter(c => c.type === 15).size.toString(), inline: true },
                { name: '🎙️ Stage Channels', value: channels.filter(c => c.type === 13).size.toString(), inline: true }
            )
            .setTimestamp();

        return embed;
    }

    /**
     * Get member statistics
     * @param {import('discord.js').Guild} guild 
     */
    async getMemberStats(guild) {
        await guild.members.fetch(); // Ensure all members are cached

        const members = guild.members.cache;
        const bots = members.filter(m => m.user.bot).size;
        const humans = members.size - bots;
        const online = members.filter(m => m.presence?.status === 'online').size;
        const admins = members.filter(m => m.permissions.has('Administrator')).size;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`👥 ${guild.name} - Member Statistics`)
            .addFields(
                { name: '👤 Total Members', value: guild.memberCount.toString(), inline: true },
                { name: '🧑 Humans', value: humans.toString(), inline: true },
                { name: '🤖 Bots', value: bots.toString(), inline: true },
                { name: '🟢 Online', value: online.toString(), inline: true },
                { name: '👑 Administrators', value: admins.toString(), inline: true },
                { name: '📅 Server Owner', value: `<@${guild.ownerId}>`, inline: true }
            )
            .setTimestamp();

        return embed;
    }

    /**
     * Get activity statistics (basic version)
     * @param {import('discord.js').Guild} guild 
     */
    async getActivityStats(guild) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📈 ${guild.name} - Activity Statistics`)
            .setDescription('Activity tracking requires message logging. This is a basic overview.')
            .addFields(
                { name: '📊 Total Channels', value: guild.channels.cache.size.toString(), inline: true },
                { name: '👥 Active Members', value: guild.members.cache.filter(m => m.presence).size.toString(), inline: true },
                { name: '💬 Text Channels', value: guild.channels.cache.filter(c => c.isTextBased()).size.toString(), inline: true }
            )
            .setFooter({ text: 'For detailed activity metrics, consider implementing a database system' })
            .setTimestamp();

        return embed;
    }
}

module.exports = new StatsService();
