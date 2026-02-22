const { ChannelType } = require('discord.js');
const { delay } = require('../utils/rateLimit');

/**
 * Service to handle channel cloning
 */
class CloneService {
    /**
     * Clone a channel with all its settings
     * @param {import('discord.js').GuildChannel} sourceChannel 
     * @param {string} newName 
     * @param {boolean} clonePermissions 
     * @param {boolean} cloneMessages 
     * @param {number} messageLimit 
     */
    async cloneChannel(sourceChannel, newName, clonePermissions = true, cloneMessages = false, messageLimit = 50) {
        const guild = sourceChannel.guild;

        // Prepare channel options
        const options = {
            name: newName || `${sourceChannel.name}-clone`,
            type: sourceChannel.type,
            parent: sourceChannel.parent,
            position: sourceChannel.position + 1
        };

        // Add text channel specific options
        if (sourceChannel.isTextBased()) {
            options.topic = sourceChannel.topic;
            options.nsfw = sourceChannel.nsfw;
            options.rateLimitPerUser = sourceChannel.rateLimitPerUser;
        }

        // Add voice channel specific options
        if (sourceChannel.type === ChannelType.GuildVoice) {
            options.bitrate = sourceChannel.bitrate;
            options.userLimit = sourceChannel.userLimit;
        }

        // Clone permission overwrites
        if (clonePermissions) {
            options.permissionOverwrites = sourceChannel.permissionOverwrites.cache.map(overwrite => ({
                id: overwrite.id,
                allow: overwrite.allow,
                deny: overwrite.deny,
                type: overwrite.type
            }));
        }

        // Create the new channel
        const newChannel = await guild.channels.create(options);

        // Clone messages if requested (only for text channels)
        if (cloneMessages && sourceChannel.isTextBased() && newChannel.isTextBased()) {
            await this.cloneMessages(sourceChannel, newChannel, messageLimit);
        }

        return newChannel;
    }

    /**
     * Clone recent messages from source to new channel
     * @param {import('discord.js').TextBasedChannel} sourceChannel 
     * @param {import('discord.js').TextBasedChannel} targetChannel 
     * @param {number} limit 
     */
    async cloneMessages(sourceChannel, targetChannel, limit = 50) {
        const messages = await sourceChannel.messages.fetch({ limit });
        const sortedMessages = Array.from(messages.values()).reverse(); // Oldest first

        let clonedCount = 0;
        for (const msg of sortedMessages) {
            try {
                const content = msg.content || null;
                const embeds = msg.embeds;
                const files = Array.from(msg.attachments.values()).map(a => a.url);

                if (!content && embeds.length === 0 && files.length === 0) continue;

                await targetChannel.send({
                    content: content ? `**${msg.author.username}:** ${content}` : null,
                    embeds: embeds,
                    files: files
                });

                clonedCount++;
                await delay(1000); // Rate limit protection
            } catch (error) {
                console.error(`Failed to clone message ${msg.id}:`, error);
            }
        }

        return clonedCount;
    }
}

module.exports = new CloneService();
