const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.join(__dirname, '../storage/tierScanConfig.json');
const RECORDS_PATH = path.join(__dirname, '../storage/tierScanRecords.json');

/**
 * Tier Request Scanner Service
 * Scans channels/threads for tier change requests and extracts structured data
 */
class TierScanService {
    constructor() {
        this.config = {};
        this.records = [];
        this.load();
    }

    // ─── Storage ─────────────────────────────────────────

    load() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                this.config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            } else {
                this.config = {
                    enabled: true,
                    scanChannels: [],
                    outputChannel: null,
                    keywords: ['tier change', 'tier request', 'move to tier', 'change tier', 'tier upgrade', 'tier downgrade'],
                    phrasePatterns: ['i want to be in tier', 'move us to tier', 'we should be tier'],
                    maxScanDepth: 100
                };
            }

            if (fs.existsSync(RECORDS_PATH)) {
                this.records = JSON.parse(fs.readFileSync(RECORDS_PATH, 'utf8'));
            } else {
                this.records = [];
            }
        } catch (error) {
            console.error('[TierScan] Error loading data:', error);
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('[TierScan] Error saving config:', error);
        }
    }

    saveRecords() {
        try {
            fs.writeFileSync(RECORDS_PATH, JSON.stringify(this.records, null, 2));
        } catch (error) {
            console.error('[TierScan] Error saving records:', error);
        }
    }

    // ─── Configuration ───────────────────────────────────

    getConfig() {
        return { ...this.config };
    }

    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        this.saveConfig();
    }

    addScanChannel(channelId) {
        if (!this.config.scanChannels.includes(channelId)) {
            this.config.scanChannels.push(channelId);
            this.saveConfig();
        }
    }

    removeScanChannel(channelId) {
        this.config.scanChannels = this.config.scanChannels.filter(id => id !== channelId);
        this.saveConfig();
    }

    // ─── Scanning ────────────────────────────────────────

    /**
     * Scan a channel for tier request messages
     * @param {TextBasedChannel} channel - Discord channel to scan
     * @param {number} limit - Max messages to scan
     * @returns {Object[]} New records found
     */
    async scanChannel(channel, limit = null) {
        const scanLimit = limit || this.config.maxScanDepth || 100;
        const newRecords = [];

        try {
            const messages = await channel.messages.fetch({ limit: Math.min(scanLimit, 100) });

            for (const [, message] of messages) {
                if (message.author.bot) continue;

                // Check if already scanned
                if (this.records.find(r => r.messageId === message.id)) continue;

                // Check if it's a tier request
                if (!this.isTierRequest(message.content)) continue;

                // Extract data
                const record = this.extractRecord(message, channel);
                newRecords.push(record);
                this.records.push(record);
            }

            if (newRecords.length > 0) {
                this.saveRecords();
            }
        } catch (error) {
            console.error(`[TierScan] Error scanning channel ${channel.id}:`, error);
            throw error;
        }

        return newRecords;
    }

    /**
     * Scan all configured channels
     * @param {Client} client - Discord client
     * @returns {Object} { scanned: number, found: number, records: Object[] }
     */
    async scanAll(client) {
        let scanned = 0;
        let totalNew = [];

        for (const channelId of this.config.scanChannels) {
            try {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) continue;

                const newRecords = await this.scanChannel(channel);
                totalNew.push(...newRecords);
                scanned++;

                // Also scan threads if it's a forum/text channel
                if (channel.threads) {
                    const threads = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
                    for (const [, thread] of threads.threads) {
                        const threadRecords = await this.scanChannel(thread);
                        totalNew.push(...threadRecords);
                    }
                }
            } catch (error) {
                console.error(`[TierScan] Error scanning channel ${channelId}:`, error);
            }
        }

        return { scanned, found: totalNew.length, records: totalNew };
    }

    /**
     * Check if message content contains a tier request
     */
    isTierRequest(content) {
        const lowerContent = content.toLowerCase();

        // Check keywords
        for (const keyword of this.config.keywords) {
            if (lowerContent.includes(keyword.toLowerCase())) return true;
        }

        // Check phrase patterns
        for (const phrase of this.config.phrasePatterns) {
            if (lowerContent.includes(phrase.toLowerCase())) return true;
        }

        return false;
    }

    /**
     * Extract structured data from a tier request message
     */
    extractRecord(message, channel) {
        const content = message.content;
        const lowerContent = content.toLowerCase();

        // Try to extract tier numbers
        const tierMatch = content.match(/tier\s*(\d)/gi);
        let requestedTier = null;
        let currentTier = null;

        if (tierMatch) {
            const tiers = tierMatch.map(t => {
                const num = t.match(/\d/);
                return num ? parseInt(num[0]) : null;
            }).filter(Boolean);

            if (tiers.length >= 2) {
                currentTier = tiers[0].toString();
                requestedTier = tiers[1].toString();
            } else if (tiers.length === 1) {
                requestedTier = tiers[0].toString();
            }
        }

        // Try to extract team name (basic heuristic: look for "team:" or "team name:")
        let teamName = null;
        const teamMatch = content.match(/(?:team\s*(?:name)?[:\-]\s*)(.+?)(?:\n|$)/i);
        if (teamMatch) teamName = teamMatch[1].trim();

        // Build jump link
        const jumpLink = `https://discord.com/channels/${message.guild?.id || '@me'}/${channel.id}/${message.id}`;

        return {
            id: `tsr_${message.id}`,
            username: message.author.username,
            userId: message.author.id,
            messageId: message.id,
            jumpLink,
            sourceChannel: channel.id,
            sourceChannelName: channel.name || 'Unknown',
            teamName: teamName || 'Not detected',
            requestedTier: requestedTier || 'Not detected',
            currentTier: currentTier || 'Not detected',
            reason: content.length > 200 ? content.substring(0, 200) + '...' : content,
            timestamp: message.createdAt.toISOString(),
            status: 'pending'
        };
    }

    // ─── Record Management ───────────────────────────────

    getRecords(filter = {}) {
        let filtered = [...this.records];

        if (filter.status) {
            filtered = filtered.filter(r => r.status === filter.status);
        }
        if (filter.channel) {
            filtered = filtered.filter(r => r.sourceChannel === filter.channel);
        }

        // Sort by timestamp descending
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return filtered;
    }

    markStatus(recordId, status) {
        const record = this.records.find(r => r.id === recordId);
        if (!record) throw new Error(`Record "${recordId}" not found.`);

        if (!['pending', 'reviewed', 'approved', 'denied'].includes(status)) {
            throw new Error('Invalid status. Use: pending, reviewed, approved, denied');
        }

        record.status = status;
        this.saveRecords();
        return record;
    }

    clearRecords() {
        this.records = [];
        this.saveRecords();
    }

    // ─── Embed Builders ──────────────────────────────────

    buildRecordEmbed(record) {
        const statusEmoji = {
            pending: '🟡',
            reviewed: '🔵',
            approved: '✅',
            denied: '❌'
        };

        return new EmbedBuilder()
            .setTitle(`${statusEmoji[record.status] || '⚪'} Tier Request`)
            .setColor(record.status === 'approved' ? '#2ECC71' : record.status === 'denied' ? '#E74C3C' : '#F1C40F')
            .addFields(
                { name: 'User', value: `<@${record.userId}> (${record.username})`, inline: true },
                { name: 'Team', value: record.teamName, inline: true },
                { name: 'Status', value: record.status.toUpperCase(), inline: true },
                { name: 'Current Tier', value: record.currentTier, inline: true },
                { name: 'Requested Tier', value: record.requestedTier, inline: true },
                { name: 'Source', value: `<#${record.sourceChannel}>`, inline: true },
                { name: 'Message', value: `[Jump to message](${record.jumpLink})`, inline: false },
                { name: 'Content', value: record.reason, inline: false }
            )
            .setFooter({ text: `ID: ${record.id}` })
            .setTimestamp(new Date(record.timestamp));
    }

    buildListEmbeds(records, page = 0, perPage = 5) {
        const totalPages = Math.ceil(records.length / perPage) || 1;
        const start = page * perPage;
        const pageRecords = records.slice(start, start + perPage);

        const statusEmoji = { pending: '🟡', reviewed: '🔵', approved: '✅', denied: '❌' };

        const embed = new EmbedBuilder()
            .setTitle(`📋 Tier Scan Results (${start + 1}–${start + pageRecords.length} of ${records.length})`)
            .setColor('#5865F2')
            .setFooter({ text: `Page ${page + 1}/${totalPages}` })
            .setTimestamp();

        if (pageRecords.length === 0) {
            embed.setDescription('No tier requests found.');
        } else {
            for (const record of pageRecords) {
                embed.addFields({
                    name: `${statusEmoji[record.status] || '⚪'} ${record.username} — ${record.teamName}`,
                    value: `**Tier:** ${record.currentTier} → ${record.requestedTier} | **Status:** ${record.status}\n[Jump](${record.jumpLink}) | ID: \`${record.id}\``,
                    inline: false
                });
            }
        }

        return { embed, totalPages };
    }
}

module.exports = new TierScanService();
