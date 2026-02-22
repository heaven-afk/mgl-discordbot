const { Collection, AttachmentBuilder } = require('discord.js');
const crypto = require('crypto');

class ExtractService {
    constructor() {
        this.activeJobs = new Collection(); // userId -> jobObject
    }

    /**
     * Start a new extraction job
     */
    async startJob(interaction, options) {
        const userId = interaction.user.id;

        if (this.activeJobs.has(userId)) {
            throw new Error('You already have an active extraction job running.');
        }

        const jobId = crypto.randomUUID().split('-')[0];

        const job = {
            id: jobId,
            userId,
            guildId: interaction.guildId,
            channel: options.channel,
            options,
            stats: {
                fetched: 0,
                processed: 0,
                kept: 0,
                oldestMessageDate: null
            },
            status: 'running', // running, cancelled, completed, failed
            messages: [],
            startTime: Date.now(),
            lastUpdate: Date.now()
        };

        this.activeJobs.set(userId, job);

        // Start processing in background
        this.processJob(job, interaction).catch(err => {
            console.error(`[Extract] Job ${jobId} failed:`, err);
            job.status = 'failed';
            job.error = err.message;
        });

        return jobId;
    }

    /**
     * Cancel an active job
     */
    cancelJob(userId) {
        const job = this.activeJobs.get(userId);
        if (!job) return false;

        job.status = 'cancelled';
        this.activeJobs.delete(userId);
        return true;
    }

    /**
     * Get job status
     */
    getJobStatus(userId) {
        return this.activeJobs.get(userId);
    }

    /**
     * Core processing loop
     */
    async processJob(job, interaction) {
        try {
            let lastId = null;
            let keepFetching = true;

            // Send initial confirmation if not deferred
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({
                    content: `Started extraction job \`${job.id}\`. Target: ${job.channel}. Limits: ${job.options.limit} messages.`,
                    ephemeral: true
                });
            }

            while (keepFetching && job.status === 'running') {
                // Rate limit guard
                await new Promise(r => setTimeout(r, 600));

                const fetchOptions = { limit: 100 };
                if (lastId) fetchOptions.before = lastId;

                const batch = await job.channel.messages.fetch(fetchOptions);

                if (batch.size === 0) {
                    keepFetching = false;
                    break;
                }

                job.stats.fetched += batch.size;
                lastId = batch.last().id;
                job.stats.oldestMessageDate = batch.last().createdAt;

                // Process batch
                for (const msg of batch.values()) {
                    job.stats.processed++;

                    // Date range checks
                    if (job.options.fromDate && msg.createdTimestamp < job.options.fromDate) {
                        keepFetching = false; // We went too far back
                        break; // Stop processing this batch
                    }
                    if (job.options.toDate && msg.createdTimestamp > job.options.toDate) {
                        continue; // Skip but keep searching older
                    }

                    // Apply filters
                    if (this.matchesFilters(msg, job.options)) {
                        job.messages.push(this.formatMessageObject(msg, job.options));
                        job.stats.kept++;
                    }

                    // Limit check
                    if (job.stats.kept >= job.options.limit) {
                        keepFetching = false;
                        break;
                    }
                }

                // Progress update every 500 fetched
                if (Date.now() - job.lastUpdate > 5000) {
                    await interaction.editReply({
                        content: `Extracting... Job \`${job.id}\`\nFetched: ${job.stats.fetched}\nKept: ${job.stats.kept}/${job.options.limit}\nOldest: ${job.stats.oldestMessageDate?.toISOString().split('T')[0] || 'N/A'}`
                    }).catch(() => { });
                    job.lastUpdate = Date.now();
                }
            }

            // Finished fetching
            if (job.status === 'cancelled') return;

            job.status = 'completed';
            this.activeJobs.delete(job.userId);

            // Generate output
            const fileBuffer = this.generateOutput(job.messages, job.options.format, job.options);
            const fileName = `export_${job.channel.name}_${Date.now()}.${job.options.format}`;

            if (fileBuffer.length > 8 * 1024 * 1024) {
                await interaction.editReply({
                    content: `Extraction complete! Found ${job.stats.kept} messages.\n\n⚠️ File too large for Discord attachment (>8MB). Please refine filters or limit.`,
                });
            } else {
                const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });
                await interaction.followUp({
                    content: `✅ Extraction complete! Job \`${job.id}\` finished.\nFound: ${job.stats.kept} messages.`,
                    files: [attachment],
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Extraction Error:', error);
            this.activeJobs.delete(job.userId);
            await interaction.followUp({
                content: `❌ Extraction failed: ${error.message}`,
                ephemeral: true
            });
        }
    }

    /**
     * Check if message matches filters
     */
    matchesFilters(msg, options) {
        // Bot filter
        if (!options.includeBots && msg.author.bot) return false;

        // User filter
        if (options.user && msg.author.id !== options.user.id) return false;

        // Query filter
        if (options.query) {
            const content = msg.content.toLowerCase();
            const queries = options.query.toLowerCase().split(' ');
            if (!queries.every(q => content.includes(q))) return false;
        }

        // Attachment filter
        if (options.attachmentsOnly && msg.attachments.size === 0) return false;

        // Link filter
        if (options.linksOnly && !msg.content.includes('http')) return false;

        return true;
    }

    /**
     * Format message for internal storage
     */
    formatMessageObject(msg, options) {
        const isAnon = options.anonymize;

        return {
            id: msg.id,
            authorId: isAnon ? this.hash(msg.author.id) : msg.author.id,
            authorTag: isAnon ? `User_${this.hash(msg.author.id).substring(0, 6)}` : msg.author.tag,
            content: msg.content,
            cleanContent: msg.cleanContent,
            createdAt: msg.createdAt.toISOString(),
            isBot: msg.author.bot,
            attachments: msg.attachments.map(a => ({
                url: a.url,
                name: a.name,
                type: a.contentType
            })),
            embeds: options.includeEmbeds ? msg.embeds : [],
            reactions: options.includeReactions ? msg.reactions.cache.map(r => ({ name: r.emoji.name, count: r.count })) : []
        };
    }

    /**
     * Generate output buffer based on format
     */
    generateOutput(messages, format, options) {
        if (format === 'json') {
            const data = {
                meta: {
                    generatedAt: new Date().toISOString(),
                    options: { ...options, channel: options.channel.name },
                    count: messages.length
                },
                messages
            };
            return Buffer.from(JSON.stringify(data, null, 2));
        }

        if (format === 'csv') {
            const headers = ['id', 'author', 'date', 'content', 'attachments', 'reactions'];
            const rows = messages.map(m => {
                const safeContent = m.content.replace(/"/g, '""').replace(/\n/g, ' ');
                const attachStr = m.attachments.map(a => a.url).join('; ');
                const reactionStr = m.reactions.map(r => `${r.name}(${r.count})`).join(' ');

                return [
                    m.id,
                    m.authorTag,
                    m.createdAt,
                    `"${safeContent}"`,
                    `"${attachStr}"`,
                    `"${reactionStr}"`
                ].join(',');
            });
            return Buffer.from([headers.join(','), ...rows].join('\n'));
        }

        if (format === 'txt') {
            const lines = messages.map(m => {
                const time = m.createdAt.split('T')[0] + ' ' + m.createdAt.split('T')[1].substring(0, 8);
                let text = `[${time}] ${m.authorTag}: ${m.cleanContent}`;
                if (m.attachments.length > 0) text += `\n[Attachments: ${m.attachments.map(a => a.url).join(', ')}]`;
                return text;
            });
            return Buffer.from(lines.reverse().join('\n')); // TXT usually reads top-down chronological
        }

        return Buffer.from('');
    }

    hash(str) {
        return crypto.createHash('md5').update(str).digest('hex');
    }
}

module.exports = new ExtractService();
