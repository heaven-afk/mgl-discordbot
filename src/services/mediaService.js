const { Collection, AttachmentBuilder } = require('discord.js');
const crypto = require('crypto');
const axios = require('axios');
const archiver = require('archiver');
const { PassThrough } = require('stream');

class MediaService {
    constructor() {
        this.activeJobs = new Collection(); // userId -> jobObject
    }

    /**
     * Start a new media extraction job
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
                filesDownloaded: 0,
                totalBytes: 0,
                zipsSent: 0,
                oldestMessageDate: null
            },
            status: 'running', // running, cancelled, completed, failed
            startTime: Date.now(),
            lastUpdate: Date.now()
        };

        this.activeJobs.set(userId, job);

        // Start processing in background
        this.processJob(job, interaction).catch(err => {
            console.error(`[Media] Job ${jobId} failed:`, err);
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
                const threadMsg = job.options.includeThreads ? ' (including threads)' : '';
                await interaction.reply({
                    content: `Started media extraction job \`${job.id}\`. Target: ${job.channel}${threadMsg}. Limits: ${job.options.limit} messages.`,
                    ephemeral: true
                });
            }

            // --- THREAD GATHERING ---
            const sourcesToScan = [];

            // If it's a forum, the main channel has no messages itself that we can fetch.
            // But if it's a normal text channel, we want to scan the main channel first.
            if (job.channel.type !== 15) {
                sourcesToScan.push({ channel: job.channel, name: 'Main' });
            }

            if (job.options.includeThreads) {
                try {
                    // Active threads
                    const activeThreads = await job.channel.threads.fetchActive();
                    activeThreads.threads.forEach(t => sourcesToScan.push({ channel: t, name: t.name }));

                    // Archived threads (limit to recent ones to avoid API spam if there are thousands)
                    const archivedThreads = await job.channel.threads.fetchArchived({ limit: 50 });
                    archivedThreads.threads.forEach(t => sourcesToScan.push({ channel: t, name: t.name }));
                } catch (err) {
                    console.error('Error fetching threads for media job:', err);
                }
            }

            // ZIP bundling variables
            let currentArchive = archiver('zip', { zlib: { level: 9 } });
            let currentStream = new PassThrough();
            let currentZipSize = 0;
            let currentZipFiles = 0;
            let currentZipBuffers = [];

            // Reinitialize the ZIP stream
            const resetZip = () => {
                currentArchive = archiver('zip', { zlib: { level: 9 } });
                currentStream = new PassThrough();
                currentZipSize = 0;
                currentZipFiles = 0;
                currentZipBuffers = [];
                currentStream.on('data', chunk => {
                    currentZipBuffers.push(chunk);
                    currentZipSize += chunk.length;
                });
                currentArchive.pipe(currentStream);
            };

            // Send the current ZIP to Discord
            const flushZip = async (isFinal = false) => {
                if (currentZipFiles === 0) return;

                await currentArchive.finalize();

                // Wait for stream to finish
                const finalBuffer = await new Promise((resolve) => {
                    currentStream.on('end', () => resolve(Buffer.concat(currentZipBuffers)));
                });

                job.stats.zipsSent++;
                const fileName = `media_${job.channel.name}_part${job.stats.zipsSent}.zip`;

                const attachment = new AttachmentBuilder(finalBuffer, { name: fileName });

                await interaction.followUp({
                    content: `📦 **Media Batch ${job.stats.zipsSent}**\nContains ${currentZipFiles} files. ${isFinal ? '(Final Batch)' : '(More coming...)'}`,
                    files: [attachment],
                    ephemeral: true
                });

                resetZip();
            };

            resetZip();

            // Track external links
            const externalLinks = new Set();
            const MAX_ZIP_SIZE = 7.5 * 1024 * 1024; // 7.5 MB safe limit for Discord 8MB limit

            for (const source of sourcesToScan) {
                if (job.status !== 'running') break;
                if (job.stats.processed >= job.options.limit) break;

                let lastId = null;
                let keepFetching = true;
                const currentChannel = source.channel;
                const folderName = source.name.replace(/[^a-zA-Z0-9.\- ]/g, '_'); // Safe folder name

                while (keepFetching && job.status === 'running') {
                    // Rate limit guard
                    await new Promise(r => setTimeout(r, 600));

                    const fetchOptions = { limit: 100 };
                    if (lastId) fetchOptions.before = lastId;

                    let batch;
                    try {
                        batch = await currentChannel.messages.fetch(fetchOptions);
                    } catch (fetchErr) {
                        console.error(`Error fetching messages from ${source.name}:`, fetchErr);
                        break;
                    }

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

                        // Limit check (limit applies to messages checked, not media found)
                        if (job.stats.processed > job.options.limit) {
                            keepFetching = false;
                            break;
                        }

                        // Extract external URLs
                        const urls = msg.content.match(/https?:\/\/[^\s]+/g);
                        if (urls) {
                            urls.forEach(u => externalLinks.add(u));
                        }

                        // Process Attachments
                        if (msg.attachments.size > 0) {
                            for (const attachment of msg.attachments.values()) {
                                // Filter by type
                                if (job.options.type === 'image' && !attachment.contentType?.startsWith('image/')) continue;
                                if (job.options.type === 'video' && !attachment.contentType?.startsWith('video/')) continue;
                                if (job.options.type === 'audio' && !attachment.contentType?.startsWith('audio/')) continue;

                                try {
                                    const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                                    const buffer = Buffer.from(response.data);

                                    // Clean filename and organize into thread folders if applicable
                                    const cleanAttachName = attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                                    const safeName = source.name === 'Main'
                                        ? `${msg.id}_${cleanAttachName}`
                                        : `${folderName}/${msg.id}_${cleanAttachName}`;

                                    // Check if adding this file exceeds the ZIP limit
                                    if (currentZipSize + buffer.length >= MAX_ZIP_SIZE) {
                                        // Flush current ZIP and restart
                                        if (currentZipFiles > 0) {
                                            await flushZip(false);
                                        }
                                    }

                                    // It might be that the single file is bigger than 8MB. 
                                    // We can't zip something that is >8MB and send it via bot.
                                    if (buffer.length >= MAX_ZIP_SIZE) {
                                        // We skip it and add the URL to limits
                                        externalLinks.add(`[TOO LARGE TO DOWNLOAD]: ${attachment.url}`);
                                        continue;
                                    }

                                    currentArchive.append(buffer, { name: safeName });
                                    job.stats.filesDownloaded++;
                                    job.stats.totalBytes += buffer.length;
                                    currentZipFiles++;

                                    // Force an update of the size (rough estimate without compression)
                                    currentZipSize += buffer.length;

                                } catch (err) {
                                    console.error(`Failed to download ${attachment.url}`, err);
                                    externalLinks.add(`[FAILED TO DOWNLOAD]: ${attachment.url}`);
                                }
                            }
                        }
                    }

                    // Progress update every 5 seconds
                    if (Date.now() - job.lastUpdate > 5000) {
                        await interaction.editReply({
                            content: `Downloading Media... Job \`${job.id}\`\nScanning: ${source.name}\nChecked: ${job.stats.processed}/${job.options.limit} messages\nDownloaded: ${job.stats.filesDownloaded} files (${(job.stats.totalBytes / 1024 / 1024).toFixed(2)} MB)\nOldest: ${job.stats.oldestMessageDate?.toISOString().split('T')[0] || 'N/A'}`
                        }).catch(() => { });
                        job.lastUpdate = Date.now();
                    }
                } // End of message loop
            } // End of source loop

            // Finished fetching
            if (job.status === 'cancelled') return;

            job.status = 'completed';
            this.activeJobs.delete(job.userId);

            // Add links file if any
            if (externalLinks.size > 0 && currentZipSize < MAX_ZIP_SIZE) {
                const linksText = Array.from(externalLinks).join('\\n');
                currentArchive.append(linksText, { name: 'external_links.txt' });
                currentZipFiles++;
            }

            // Flush remaining files
            await flushZip(true);

            if (job.stats.filesDownloaded === 0) {
                await interaction.followUp({
                    content: `✅ Extraction job \`${job.id}\` finished, but no matching media files were found.`,
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: `🎉 **Media Extraction Complete!**\nJob \`${job.id}\` finished.\nDownloaded **${job.stats.filesDownloaded} files** (${(job.stats.totalBytes / 1024 / 1024).toFixed(2)} MB) across **${job.stats.zipsSent} batch(es)**.\nExternal links were saved to \`external_links.txt\` if applicable.`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Media Extraction Error:', error);
            this.activeJobs.delete(job.userId);
            await interaction.followUp({
                content: `❌ Media Extraction failed: ${error.message}`,
                ephemeral: true
            });
        }
    }
}

module.exports = new MediaService();
