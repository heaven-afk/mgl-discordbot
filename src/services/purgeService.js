const { delay } = require('../utils/rateLimit');

/**
 * Service to handle bulk message deletion
 */
class PurgeService {
    /**
     * Fetch and filter messages for deletion
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {object} filters
     */
    async fetchMessagesToDelete(channel, filters) {
        const { amount, user, botsOnly, contains } = filters;

        // Discord limitation: can only bulk delete messages less than 14 days old
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

        let messages = [];
        let lastId;
        let remaining = amount;

        while (remaining > 0 && messages.length < amount) {
            const fetchAmount = Math.min(remaining, 100);
            const options = { limit: fetchAmount };
            if (lastId) options.before = lastId;

            const fetched = await channel.messages.fetch(options);
            if (fetched.size === 0) break;

            for (const msg of fetched.values()) {
                // Check age limit
                if (msg.createdTimestamp < twoWeeksAgo) continue;

                // Apply filters
                if (user && msg.author.id !== user.id) continue;
                if (botsOnly && !msg.author.bot) continue;
                if (contains && !msg.content.toLowerCase().includes(contains.toLowerCase())) continue;

                messages.push(msg);
                if (messages.length >= amount) break;
            }

            lastId = fetched.last().id;
            remaining = amount - messages.length;
        }

        return messages;
    }

    /**
     * Delete messages in bulk
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {Array} messages 
     */
    async deleteMessages(channel, messages) {
        if (messages.length === 0) return 0;

        // Discord allows bulk delete up to 100 messages at once
        const chunks = [];
        for (let i = 0; i < messages.length; i += 100) {
            chunks.push(messages.slice(i, i + 100));
        }

        let deletedCount = 0;
        for (const chunk of chunks) {
            try {
                if (chunk.length === 1) {
                    // Single message delete
                    await chunk[0].delete();
                    deletedCount++;
                } else {
                    // Bulk delete
                    await channel.bulkDelete(chunk, true); // true = filter out old messages
                    deletedCount += chunk.length;
                }
                await delay(1000); // Rate limit protection
            } catch (error) {
                console.error('Error deleting messages:', error);
            }
        }

        return deletedCount;
    }
}

module.exports = new PurgeService();
