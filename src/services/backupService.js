const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

class BackupService {
    async createBackup(channel, range = '100', user) {
        const messages = await this.fetchMessages(channel, range);

        // Structure data
        const backupData = {
            metadata: {
                channel: {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type
                },
                guild: {
                    id: channel.guild.id,
                    name: channel.guild.name
                },
                backup: {
                    createdAt: new Date().toISOString(),
                    createdBy: user.tag,
                    messageCount: messages.length
                }
            },
            messages: messages.map(msg => ({
                id: msg.id,
                author: {
                    id: msg.author.id,
                    username: msg.author.username,
                    bot: msg.author.bot
                },
                content: msg.content,
                timestamp: new Date(msg.createdTimestamp).toISOString(),
                edited: msg.editedTimestamp ? new Date(msg.editedTimestamp).toISOString() : null,
                attachments: Array.from(msg.attachments.values()).map(a => ({
                    name: a.name,
                    url: a.url,
                    size: a.size
                })),
                embeds: msg.embeds,
                reactions: Array.from(msg.reactions.cache.values()).map(r => ({
                    emoji: r.emoji.name,
                    count: r.count
                }))
            }))
        };

        const fileName = `${channel.guild.name}_${channel.name}_${new Date().toISOString().split('T')[0]}.json`
            .replace(/[^a-z0-9]/gi, '_'); // Sanitize filename

        const filePath = path.join(__dirname, '../storage/backups', fileName);

        // Ensure dir exists
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

        return { filePath, fileName, messageCount: messages.length };
    }

    async fetchMessages(channel, range) {
        let limit;
        let startTime;

        if (range === '100') {
            limit = 100;
        } else if (range.endsWith('d')) {
            const days = parseInt(range);
            startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            limit = Infinity; // We'll fetch until time limit
        } else {
            // Default to 100
            limit = 100;
        }

        let messages = [];
        let lastId;
        let fetchMore = true;

        while (fetchMore) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const fetched = await channel.messages.fetch(options);
            if (fetched.size === 0) break;

            for (const msg of fetched.values()) {
                if (startTime && msg.createdTimestamp < startTime) {
                    fetchMore = false;
                    break;
                }
                messages.push(msg);
            }

            if (messages.length >= limit && limit !== Infinity) {
                messages = messages.slice(0, limit);
                break;
            }

            lastId = fetched.last().id;
        }

        return messages.reverse(); // Chronological order
    }
}

module.exports = new BackupService();
