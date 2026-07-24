const { AttachmentBuilder, ChannelType } = require('discord.js');
const { delay } = require('../utils/rateLimit');

/**
 * Service to handle moving messages and forum posts between channels
 */
class MessageMover {
    /**
     * Checks if a channel is a Forum or Media channel
     * @param {import('discord.js').Channel} channel 
     * @returns {boolean}
     */
    isForumChannel(channel) {
        if (!channel) return false;
        return channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia;
    }

    /**
     * Extracts attachments from a message as AttachmentBuilder objects
     * @param {import('discord.js').Message} msg 
     * @returns {AttachmentBuilder[]}
     */
    extractAttachments(msg) {
        if (!msg || !msg.attachments || msg.attachments.size === 0) return [];
        return Array.from(msg.attachments.values()).map(att => {
            return new AttachmentBuilder(att.url, { name: att.name });
        });
    }

    /**
     * Formats message content with author header if requested
     * @param {import('discord.js').Message} msg 
     * @param {boolean} keepAuthorContext 
     * @returns {string}
     */
    formatContent(msg, keepAuthorContext) {
        if (!keepAuthorContext || !msg.author) return msg.content || '';

        const time = Math.floor(msg.createdTimestamp / 1000);
        const header = `**Originally sent by ${msg.author.username}** • <t:${time}:f>\n`;
        return `${header}${msg.content || ''}`;
    }

    /**
     * Maps tag IDs from source forum to destination forum by tag name
     * @param {import('discord.js').ThreadChannel} sourceThread 
     * @param {import('discord.js').ForumChannel} sourceForum 
     * @param {import('discord.js').ForumChannel} destinationForum 
     * @returns {string[]}
     */
    mapTags(sourceThread, sourceForum, destinationForum) {
        if (!sourceThread.appliedTags || sourceThread.appliedTags.length === 0) return [];
        if (!sourceForum || !sourceForum.availableTags || sourceForum.availableTags.length === 0) return [];
        if (!destinationForum || !destinationForum.availableTags || destinationForum.availableTags.length === 0) return [];

        const sourceTagNames = sourceThread.appliedTags.map(tagId => {
            const tagObj = sourceForum.availableTags.find(t => t.id === tagId);
            return tagObj ? tagObj.name.toLowerCase() : null;
        }).filter(Boolean);

        return destinationForum.availableTags
            .filter(destTag => sourceTagNames.includes(destTag.name.toLowerCase()))
            .map(destTag => destTag.id);
    }

    /**
     * Fetch messages from source channel/thread
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {number} limit 
     * @param {string} [afterId] 
     * @returns {Promise<import('discord.js').Message[]>}
     */
    async fetchMessages(channel, limit, afterId) {
        let messages = [];
        let lastId = afterId;
        let remaining = limit;

        while (remaining > 0) {
            const batchSize = Math.min(remaining, 100);
            const options = { limit: batchSize };
            if (lastId) options.after = lastId;

            const fetched = await channel.messages.fetch(options).catch(() => null);
            if (!fetched || fetched.size === 0) break;

            const sortedMessages = Array.from(fetched.values()).reverse(); // Oldest first
            messages = messages.concat(sortedMessages);

            lastId = sortedMessages[sortedMessages.length - 1].id;
            remaining -= fetched.size;
        }

        return messages;
    }

    /**
     * Fetch forum posts (threads) from a forum channel
     * @param {import('discord.js').ForumChannel} forumChannel 
     * @param {number} limit 
     * @param {string} [afterId] 
     * @returns {Promise<import('discord.js').ThreadChannel[]>}
     */
    async fetchForumPosts(forumChannel, limit = 100, afterId = null) {
        let threads = [];

        try {
            const active = await forumChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
            const archived = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => ({ threads: new Map() }));

            const allThreadsMap = new Map([...active.threads, ...archived.threads]);
            threads = Array.from(allThreadsMap.values());

            // Sort by thread ID (creation timestamp) ascending (oldest first)
            threads.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

            if (afterId) {
                threads = threads.filter(t => BigInt(t.id) > BigInt(afterId));
            }

            return threads.slice(0, limit);
        } catch (err) {
            console.error('Error fetching forum posts:', err);
            return threads;
        }
    }

    /**
     * Transfer messages between text-based channels/threads
     * @param {object} params
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async moveMessages({ source, destination, messages, includeBots, deleteOriginal, keepAuthorContext }, interaction) {
        let count = 0;

        for (const msg of messages) {
            if (!includeBots && msg.author.bot) continue;

            try {
                const content = this.formatContent(msg, keepAuthorContext);
                const files = this.extractAttachments(msg);
                const embeds = msg.embeds || [];

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
                await delay(1000);

            } catch (error) {
                console.error(`Failed to move message ${msg.id}:`, error);
            }
        }
        return count;
    }

    /**
     * Transfer posts from one Forum channel to another Forum channel
     */
    async moveForumPosts({ sourceForum, destinationForum, posts, includeBots, deleteOriginal, keepAuthorContext }, interaction) {
        let movedCount = 0;

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];

            if (interaction) {
                await interaction.editReply(`Moving forum post ${i + 1}/${posts.length}: **${post.name}**...`).catch(() => {});
            }

            try {
                let starterMsg = await post.fetchStarterMessage().catch(() => null);
                let allMsgs = await this.fetchMessages(post, 100);

                if (starterMsg && !allMsgs.some(m => m.id === starterMsg.id)) {
                    allMsgs.unshift(starterMsg);
                }

                if (allMsgs.length === 0 && !starterMsg) {
                    continue;
                }

                const starter = starterMsg || allMsgs[0];
                const replyMsgs = starterMsg
                    ? allMsgs.filter(m => m.id !== starterMsg.id)
                    : allMsgs.slice(1);

                const matchedTags = this.mapTags(post, sourceForum, destinationForum);
                const initialContent = this.formatContent(starter, keepAuthorContext);
                const initialFiles = this.extractAttachments(starter);
                const initialEmbeds = starter.embeds || [];

                const newPost = await destinationForum.threads.create({
                    name: post.name,
                    message: {
                        content: initialContent || null,
                        files: initialFiles,
                        embeds: initialEmbeds
                    },
                    appliedTags: matchedTags
                });

                await delay(1000);

                // Copy remaining replies into the new forum thread
                for (const reply of replyMsgs) {
                    if (!includeBots && reply.author.bot) continue;

                    const content = this.formatContent(reply, keepAuthorContext);
                    const files = this.extractAttachments(reply);
                    const embeds = reply.embeds || [];

                    if (!content && files.length === 0 && embeds.length === 0) continue;

                    await newPost.send({
                        content: content || null,
                        files: files,
                        embeds: embeds
                    });

                    await delay(1000);
                }

                if (deleteOriginal) {
                    await post.delete().catch(() => {});
                }

                movedCount++;
            } catch (err) {
                console.error(`Failed to move forum post "${post.name}" (${post.id}):`, err);
            }
        }

        return movedCount;
    }

    /**
     * Transfer a single thread/forum post into a destination Forum channel as a new forum post
     */
    async moveThreadToForum({ sourceThread, destinationForum, includeBots, deleteOriginal, keepAuthorContext }, interaction) {
        const posts = [sourceThread];
        const sourceForum = sourceThread.parent && this.isForumChannel(sourceThread.parent) ? sourceThread.parent : null;
        return await this.moveForumPosts({
            sourceForum,
            destinationForum,
            posts,
            includeBots,
            deleteOriginal,
            keepAuthorContext
        }, interaction);
    }

    /**
     * Transfer messages from a Text Channel into a new Forum Post in a destination Forum Channel
     */
    async moveTextToForum({ sourceChannel, destinationForum, limit, afterId, includeBots, deleteOriginal, keepAuthorContext }, interaction) {
        const messages = await this.fetchMessages(sourceChannel, limit, afterId);
        if (messages.length === 0) return 0;

        const filtered = includeBots ? messages : messages.filter(m => !m.author.bot);
        if (filtered.length === 0) return 0;

        const starter = filtered[0];
        const replies = filtered.slice(1);

        const title = `Moved from #${sourceChannel.name}`;
        const initialContent = this.formatContent(starter, keepAuthorContext);
        const initialFiles = this.extractAttachments(starter);
        const initialEmbeds = starter.embeds || [];

        const newPost = await destinationForum.threads.create({
            name: title,
            message: {
                content: initialContent || null,
                files: initialFiles,
                embeds: initialEmbeds
            }
        });

        if (deleteOriginal) {
            await starter.delete().catch(() => {});
        }

        await delay(1000);

        for (const reply of replies) {
            const content = this.formatContent(reply, keepAuthorContext);
            const files = this.extractAttachments(reply);
            const embeds = reply.embeds || [];

            if (!content && files.length === 0 && embeds.length === 0) continue;

            await newPost.send({
                content: content || null,
                files: files,
                embeds: embeds
            });

            if (deleteOriginal) {
                await reply.delete().catch(() => {});
            }

            await delay(1000);
        }

        return filtered.length;
    }

    /**
     * Transfer posts from a Forum Channel into a destination Text Channel
     */
    async moveForumToText({ sourceForum, destinationText, posts, includeBots, deleteOriginal, keepAuthorContext }, interaction) {
        let totalMoved = 0;

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];

            if (interaction) {
                await interaction.editReply(`Moving forum post ${i + 1}/${posts.length}: **${post.name}** to text channel...`).catch(() => {});
            }

            try {
                let starterMsg = await post.fetchStarterMessage().catch(() => null);
                let allMsgs = await this.fetchMessages(post, 100);

                if (starterMsg && !allMsgs.some(m => m.id === starterMsg.id)) {
                    allMsgs.unshift(starterMsg);
                }

                if (allMsgs.length === 0) continue;

                // Send post header banner in text channel
                await destinationText.send({
                    content: `📌 **--- Forum Post: ${post.name} ---**`
                });
                await delay(1000);

                const count = await this.moveMessages({
                    source: post,
                    destination: destinationText,
                    messages: allMsgs,
                    includeBots,
                    deleteOriginal: false,
                    keepAuthorContext
                }, interaction);

                totalMoved += count;

                if (deleteOriginal) {
                    await post.delete().catch(() => {});
                }
            } catch (err) {
                console.error(`Failed to move forum post "${post.name}" to text:`, err);
            }
        }

        return totalMoved;
    }
}

module.exports = new MessageMover();
