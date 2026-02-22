const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const rosterParser = require('../services/rosterParser');
const archiver = require('archiver');
const { PassThrough } = require('stream');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roster')
        .setDescription('Extract team registration data from channel messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('scrape')
                .setDescription('Scrape registration messages and export as CSV/JSON')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to scrape (default: current)')
                )
                .addIntegerOption(opt =>
                    opt.setName('limit')
                        .setDescription('Max messages to scan (default: 500)')
                        .setMinValue(1)
                        .setMaxValue(5000)
                )
                .addBooleanOption(opt =>
                    opt.setName('include_threads')
                        .setDescription('Also scrape threads in the channel (default: false)')
                )
                .addStringOption(opt =>
                    opt.setName('format')
                        .setDescription('Output format (default: csv)')
                        .addChoices(
                            { name: 'CSV', value: 'csv' },
                            { name: 'JSON', value: 'json' }
                        )
                )
                .addStringOption(opt =>
                    opt.setName('slot_message_id')
                        .setDescription('Message ID containing the numbered team slot list')
                )
                .addChannelOption(opt =>
                    opt.setName('slot_channel')
                        .setDescription('Channel containing the slot list message')
                )
        )
        .addSubcommand(sub =>
            sub.setName('preview')
                .setDescription('Preview parsing of recent messages before full export')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to preview (default: current)')
                )
                .addIntegerOption(opt =>
                    opt.setName('count')
                        .setDescription('Number of messages to preview (default: 3)')
                        .setMinValue(1)
                        .setMaxValue(10)
                )
                .addBooleanOption(opt =>
                    opt.setName('include_threads')
                        .setDescription('Also preview thread messages (default: false)')
                )
        ),

    async execute(interaction) {
        try {
            const sub = interaction.options.getSubcommand();
            if (sub === 'scrape') {
                await this.handleScrape(interaction);
            } else if (sub === 'preview') {
                await this.handlePreview(interaction);
            }
        } catch (error) {
            console.error('[Roster] Execute error:', error);
            // If the interaction hasn't been replied to yet, send a fallback
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
            } else {
                await interaction.editReply({ content: `❌ Error: ${error.message}` }).catch(() => { });
            }
        }
    },

    async handleScrape(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const limit = interaction.options.getInteger('limit') || 500;
        const includeThreads = interaction.options.getBoolean('include_threads') || false;
        const format = interaction.options.getString('format') || 'csv';
        const slotMessageId = interaction.options.getString('slot_message_id');
        const slotChannel = interaction.options.getChannel('slot_channel');

        try {
            // Check for threads if requested
            let threadsToScan = [];
            let exportMode = 'single'; // Default mode

            if (includeThreads) {
                await interaction.editReply(`🔍 Checking for threads in **${channel.name}**...`);
                
                // Get active threads
                const activeThreads = [...(channel.threads?.cache.values() || [])];
                
                // Get archived threads
                let archivedThreads = [];
                try {
                    const fetched = await channel.threads.fetchArchived({ limit: 50 });
                    archivedThreads = [...fetched.threads.values()];
                } catch (e) {
                    // Channel might not support threads
                }

                threadsToScan = [...activeThreads, ...archivedThreads];

                if (threadsToScan.length > 0) {
                    // Ask user how they want the output
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('export_single')
                            .setLabel(`Single Combined File (${threadsToScan.length} Threads)`)
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('export_separate')
                            .setLabel('Separate Files per Thread (ZIP)')
                            .setStyle(ButtonStyle.Secondary)
                    );

                    const reply = await interaction.editReply({
                        content: `Found **${threadsToScan.length} threads** in ${channel}. How would you like the extracted data formatted?`,
                        components: [row]
                    });

                    try {
                        const confirm = await reply.awaitMessageComponent({
                            filter: i => i.user.id === interaction.user.id,
                            time: 60000,
                            componentType: ComponentType.Button
                        });
                        
                        exportMode = confirm.customId === 'export_separate' ? 'separate' : 'single';
                        await confirm.update({ content: `⏳ Selected ${exportMode} mode. Starting extraction...`, components: [] });
                    } catch (e) {
                        return interaction.editReply({ content: '❌ Thread extraction selection timed out.', components: [] });
                    }
                }
            }

            // Parse slot list if provided
            let slotMap = null;
            if (slotMessageId) {
                const slotCh = slotChannel || channel;
                try {
                    const slotMsg = await slotCh.messages.fetch(slotMessageId);
                    slotMap = rosterParser.parseSlotList(slotMsg.content);

                    if (Object.keys(slotMap).length === 0) {
                        await interaction.editReply('⚠️ Slot message found but no numbered list detected. Continuing without slots.');
                        slotMap = null;
                    }
                } catch (err) {
                    await interaction.editReply('⚠️ Could not fetch slot message. Continuing without slots.');
                    slotMap = null;
                }
            }

            // Helper to process a single channel/thread
            const processSource = async (srcChannel) => {
                const msgs = await this.fetchMessages(srcChannel, limit);
                const players = [];
                let teamCount = 0;

                for (const msg of msgs) {
                    if (msg.author.bot) continue;
                    if (!msg.content || msg.content.trim().length < 10) continue;

                    const result = rosterParser.parseMessage(msg.content);
                    if (result && result.players.length > 0) {
                        players.push(...result.players);
                        teamCount++;
                    }
                }
                return { sourceName: srcChannel.name, players, teamCount };
            };

            // Process main channel
            await interaction.editReply(`🔍 Scaning main channel... (limit: ${limit})`);
            const allSources = [];
            const mainResult = await processSource(channel);
            if (mainResult.players.length > 0) allSources.push(mainResult);

            // Process threads
            if (threadsToScan.length > 0) {
                await interaction.editReply(`🔍 Scaning ${threadsToScan.length} threads...`);
                for (const thread of threadsToScan) {
                    const trResult = await processSource(thread);
                    if (trResult.players.length > 0) allSources.push(trResult);
                }
            }

            if (allSources.length === 0) {
                return interaction.editReply('❌ No registration data found in the scanned messages.');
            }

            // Calculate totals
            const totalPlayers = allSources.reduce((acc, src) => acc + src.players.length, 0);
            const totalTeams = allSources.reduce((acc, src) => acc + src.teamCount, 0);

            // Generate Output
            if (exportMode === 'single') {
                // Combine into one big array
                const combinedPlayers = [];
                for (const src of allSources) {
                    for (const p of src.players) {
                        // Attach source name onto the object for parser
                        p._sourceName = src.sourceName;
                        combinedPlayers.push(p);
                    }
                }

                // Parser handles finding the Source and returning a buffer
                const buffer = format === 'json'
                    ? rosterParser.toJSON(combinedPlayers, slotMap, 'Main/Mixed')
                    // Override the normal players map in parser to use p._sourceName dynamically
                    : Buffer.from([
                        ['SLOT', 'Professional Name', 'IGN', 'UID', 'Team Name', 'Clan Name', 'Discord', 'Device', 'Region', 'Country', 'Serial Number', 'Source Thread'].join(','),
                        ...combinedPlayers.map(p => {
                            const slot = slotMap ? (rosterParser.matchSlot(p.teamName, slotMap) || '') : '';
                            return [
                                slot, rosterParser._csvEscape(p.professionalName || ''), rosterParser._csvEscape(p.ign || ''),
                                rosterParser._csvEscape(p.uid || ''), rosterParser._csvEscape(p.teamName || ''),
                                rosterParser._csvEscape(p.clanName || ''), rosterParser._csvEscape(p.discord || ''),
                                rosterParser._csvEscape(p.device || ''), rosterParser._csvEscape(p.region || ''),
                                rosterParser._csvEscape(p.country || ''), rosterParser._csvEscape(p.serialNumber || ''),
                                rosterParser._csvEscape(p._sourceName || 'Unknown')
                            ].join(',');
                        })
                    ].join('\n'), 'utf-8');

                const fileName = `roster_combined_${Date.now()}.${format}`;
                if (buffer.length > 8 * 1024 * 1024) return interaction.editReply('⚠️ Export >8MB.');
                
                await interaction.editReply({
                    content: `✅ **Roster Export Complete (Single)**\n📊 Found **${totalPlayers} players** in **${totalTeams} teams**\n📁 Format: ${format.toUpperCase()}`,
                    files: [new AttachmentBuilder(buffer, { name: fileName })]
                });

            } else {
                // Separate Files (ZIP)
                await interaction.editReply(`📦 Zipping ${allSources.length} separate files...`);
                
                const stream = new PassThrough();
                const archive = archiver('zip', { zlib: { level: 9 } });
                
                // Collect stream data into a buffer to attach to Discord
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                
                // Promise resolves when zip is fully built
                const finalizePromise = new Promise((resolve) => {
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                });

                archive.pipe(stream);

                for (const src of allSources) {
                    const safeName = src.sourceName.replace(/[^a-zA-Z0-9]/g, '_');
                    const fileBuffer = format === 'json'
                        ? rosterParser.toJSON(src.players, slotMap)
                        : rosterParser.toCSV(src.players, slotMap);
                        
                    archive.append(fileBuffer, { name: `${safeName}.${format}` });
                }

                await archive.finalize();
                const finalBuffer = await finalizePromise;

                if (finalBuffer.length > 8 * 1024 * 1024) return interaction.editReply('⚠️ Exceeds Discord 8MB limit.');

                await interaction.editReply({
                    content: `✅ **Roster Export Complete (Separate ZIP)**\n📊 Found **${totalPlayers} players**\n📁 Contains ${allSources.length} files.`,
                    files: [new AttachmentBuilder(finalBuffer, { name: `rosters_${Date.now()}.zip` })]
                });
            }

        } catch (error) {
            console.error('[Roster] Scrape error:', error);
            await interaction.editReply(`❌ Error during extraction: ${error.message}`);
        }
    },

    async handlePreview(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const count = interaction.options.getInteger('count') || 3;
        const includeThreads = interaction.options.getBoolean('include_threads') || false;

        try {
            let allMessages = [...(await channel.messages.fetch({ limit: 50 })).values()];

            // Fetch thread messages too
            if (includeThreads) {
                const threadMessages = await this.fetchThreadMessages(channel, 50);
                allMessages = [...allMessages, ...threadMessages];
            }

            // Filter to non-bot messages with enough content
            const candidates = allMessages
                .filter(m => !m.author.bot && m.content && m.content.trim().length > 10)
                .slice(0, count);

            if (candidates.length === 0) {
                return interaction.editReply('❌ No candidate messages found in recent history.');
            }

            let preview = '**📋 Roster Parse Preview**\n\n';

            for (const msg of candidates) {
                const result = rosterParser.parseMessage(msg.content);

                preview += `**Message by ${msg.author.username}** (${msg.createdAt.toISOString().split('T')[0]})\n`;

                if (!result) {
                    preview += '> ❌ Not recognized as registration\n\n';
                    continue;
                }

                preview += `> 🏢 Team: ${result.team.teamName || 'N/A'} | Clan: ${result.team.clanName || 'N/A'}\n`;
                preview += `> 👥 Players found: ${result.players.length}\n`;

                for (const p of result.players) {
                    preview += `>   • ${p.professionalName || '?'} — IGN: ${p.ign || '?'} — ${p.device || '?'}\n`;
                }
                preview += '\n';
            }

            // Truncate if too long
            if (preview.length > 1900) {
                preview = preview.substring(0, 1900) + '\n... (truncated)';
            }

            await interaction.editReply(preview);

        } catch (error) {
            console.error('[Roster] Preview error:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    /**
     * Fetch messages from a channel with pagination
     */
    async fetchMessages(channel, limit) {
        const collected = [];
        let lastId = null;

        while (collected.length < limit) {
            const fetchOpts = { limit: 100 };
            if (lastId) fetchOpts.before = lastId;

            const batch = await channel.messages.fetch(fetchOpts);
            if (batch.size === 0) break;

            collected.push(...batch.values());
            lastId = batch.last().id;

            // Rate limit guard
            await new Promise(r => setTimeout(r, 300));
        }

        return collected.slice(0, limit);
    },

    /**
     * Fetch messages from all active and archived threads in a channel
     */
    async fetchThreadMessages(channel, limitPerThread = 200) {
        const allMessages = [];

        try {
            // Get active threads
            const activeThreads = channel.threads?.cache || new Map();

            // Get archived threads
            let archivedThreads = [];
            try {
                const fetched = await channel.threads.fetchArchived({ limit: 50 });
                archivedThreads = [...fetched.threads.values()];
            } catch (e) {
                // Channel may not support threads
            }

            const allThreads = [...activeThreads.values(), ...archivedThreads];

            for (const thread of allThreads) {
                const messages = await this.fetchMessages(thread, limitPerThread);
                allMessages.push(...messages);
            }
        } catch (error) {
            console.error('[Roster] Thread fetch error:', error);
        }

        return allMessages;
    }
};
