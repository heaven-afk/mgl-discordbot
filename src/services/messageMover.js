const { delay } = require('../utils/rateLimit');

/**
 * Service to handle moving messages between channels
 */
class MessageMover {
    /**
     * Fetch messages from source channel
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {number} limit 
     * @param {string} afterId 
     */
    async fetchMessages(channel, limit, afterId) {
        let messages = [];
        let lastId = afterId;
        let remaining = limit;

        while (remaining > 0) {
            const batchSize = Math.min(remaining, 100);
            const options = { limit: batchSize };
            if (lastId) options.after = lastId;

            const fetched = await channel.messages.fetch(options);
            if (fetched.size === 0) break;

            // fetch returns newest first by default if 'after' is NOT specified, but 'after' returns oldest first from that point.
            // Wait, 'after' X returns messages newer than X, in reverse chronological order (newest first) by default?
            // Documentation says: The messages are sorted by ID in descending order (newest first). 
            // If 'after' is set, it gets messages newer than 'after'.
            // We want chronological order (oldest -> newest) for reposting.

            // If we use 'after', we get messages newer than that ID.
            // To get them in chronological order for processing, we need to reverse the collection.

            const sortedMessages = Array.from(fetched.values()).reverse(); // Oldest first
            messages = messages.concat(sortedMessages);

            lastId = sortedMessages[sortedMessages.length - 1].id;
            remaining -= fetched.size;
        }

        return messages;
    }

    /**
     * Transfer messages
     * @param {object} params
     * @param {import('discord.js').ChatInputCommandInteraction} interaction used for updates
     */
    async moveMessages({ source, destination, messages, includeBots, deleteOriginal, keepAuthorContext }, interaction) {
        let count = 0;

        for (const msg of messages) {
            if (!includeBots && msg.author.bot) continue;

            try {
                const content = this.formatContent(msg, keepAuthorContext);
                const files = Array.from(msg.attachments.values()).map(a => a.url);
                const embeds = msg.embeds;

                if (!content && files.length === 0 && embeds.length === 0) continue;

                await destination.send({
                    content: content || null,
                    files: files,
                    embeds: embeds
                });

                if (deleteOriginal) {
                    await msg.delete().catch(() => { });
                }

                count++;
                // Rate limit: 1000ms
                await delay(1000);

            } catch (error) {
                console.error(`Failed to move message ${msg.id}:`, error);
            }
        }
        return count;
    }

    formatContent(msg, keepAuthorContext) {
        if (!keepAuthorContext) return msg.content;

        const time = Math.floor(msg.createdTimestamp / 1000);
        const header = `**Originally sent by ${msg.author.username}** • <t:${time}:f>\n`;
        return `${header}${msg.content}`;
    }
}

module.exports = new MessageMover();
