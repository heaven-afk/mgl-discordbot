const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

/**
 * Service to handle full channel archiving (no message limit)
 */
class ArchiveService {
    /**
     * Fetch ALL messages from a channel
     * @param {import('discord.js').TextBasedChannel} channel 
     */
    async fetchAllMessages(channel) {
        let allMessages = [];
        let lastId;
        let hasMore = true;

        while (hasMore) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const fetched = await channel.messages.fetch(options);
            if (fetched.size === 0) {
                hasMore = false;
                break;
            }

            allMessages = allMessages.concat(Array.from(fetched.values()));
            lastId = fetched.last().id;
        }

        return allMessages.reverse(); // Chronological order
    }

    /**
     * Create comprehensive archive
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {string} format 
     * @param {import('discord.js').User} user 
     */
    async createArchive(channel, format = 'json', user) {
        const messages = await this.fetchAllMessages(channel);

        const archiveData = {
            metadata: {
                channel: {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    topic: channel.topic || null,
                    nsfw: channel.nsfw || false
                },
                guild: {
                    id: channel.guild.id,
                    name: channel.guild.name
                },
                archive: {
                    createdAt: new Date().toISOString(),
                    createdBy: user.tag,
                    messageCount: messages.length,
                    type: 'full_archive'
                }
            },
            messages: messages.map(msg => ({
                id: msg.id,
                author: {
                    id: msg.author.id,
                    username: msg.author.username,
                    discriminator: msg.author.discriminator,
                    bot: msg.author.bot,
                    avatar: msg.author.displayAvatarURL()
                },
                content: msg.content,
                timestamp: new Date(msg.createdTimestamp).toISOString(),
                edited: msg.editedTimestamp ? new Date(msg.editedTimestamp).toISOString() : null,
                attachments: Array.from(msg.attachments.values()).map(a => ({
                    name: a.name,
                    url: a.url,
                    size: a.size,
                    contentType: a.contentType
                })),
                embeds: msg.embeds.map(e => ({
                    title: e.title,
                    description: e.description,
                    url: e.url,
                    color: e.color,
                    fields: e.fields
                })),
                reactions: Array.from(msg.reactions.cache.values()).map(r => ({
                    emoji: r.emoji.name || r.emoji.id,
                    count: r.count
                })),
                mentions: {
                    users: msg.mentions.users.map(u => u.username),
                    roles: msg.mentions.roles.map(r => r.name),
                    everyone: msg.mentions.everyone
                }
            }))
        };

        const fileName = `archive_${channel.guild.name}_${channel.name}_${new Date().toISOString().split('T')[0]}.json`
            .replace(/[^a-z0-9]/gi, '_');

        const filePath = path.join(__dirname, '../storage/backups', fileName);

        // Ensure directory exists
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(archiveData, null, 2));

        return { filePath, fileName, messageCount: messages.length };
    }
}

module.exports = new ArchiveService();
