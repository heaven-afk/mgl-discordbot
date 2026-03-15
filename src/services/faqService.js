const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const STORAGE_PATH = path.join(__dirname, '../storage/faqEntries.json');

/**
 * FAQ Service — manages FAQ entries and trigger matching
 */
class FaqService {
    constructor() {
        this.data = { enabled: true, globalCooldown: 10, entries: [] };
        this.cooldowns = new Map(); // key -> timestamp
        this.load();
    }

    // ─── Storage ─────────────────────────────────────────

    load() {
        try {
            if (fs.existsSync(STORAGE_PATH)) {
                this.data = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
            } else {
                this.save();
            }
        } catch (error) {
            console.error('[FAQ Service] Error loading data:', error);
        }
    }

    save() {
        try {
            const dir = path.dirname(STORAGE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('[FAQ Service] Error saving data:', error);
        }
    }

    // ─── CRUD ────────────────────────────────────────────

    addEntry(entry) {
        if (this.data.entries.find(e => e.id === entry.id)) {
            throw new Error(`Entry with ID "${entry.id}" already exists.`);
        }
        const newEntry = {
            id: entry.id,
            category: entry.category || 'General',
            triggers: entry.triggers || [],
            aliases: entry.aliases || [],
            matchMode: entry.matchMode || 'contains',
            response: entry.response || { type: 'text', text: '' },
            cooldown: entry.cooldown ?? 30,
            channels: entry.channels || [],
            roles: entry.roles || [],
            enabled: entry.enabled ?? true
        };
        this.data.entries.push(newEntry);
        this.save();
        return newEntry;
    }

    editEntry(id, updates) {
        const entry = this.data.entries.find(e => e.id === id);
        if (!entry) throw new Error(`Entry "${id}" not found.`);

        for (const [key, value] of Object.entries(updates)) {
            if (key !== 'id') entry[key] = value;
        }
        this.save();
        return entry;
    }

    removeEntry(id) {
        const index = this.data.entries.findIndex(e => e.id === id);
        if (index === -1) throw new Error(`Entry "${id}" not found.`);
        const removed = this.data.entries.splice(index, 1)[0];
        this.save();
        return removed;
    }

    getEntry(id) {
        return this.data.entries.find(e => e.id === id) || null;
    }

    listEntries() {
        return this.data.entries;
    }

    toggleEntry(id) {
        const entry = this.data.entries.find(e => e.id === id);
        if (!entry) throw new Error(`Entry "${id}" not found.`);
        entry.enabled = !entry.enabled;
        this.save();
        return entry;
    }

    toggleSystem() {
        this.data.enabled = !this.data.enabled;
        this.save();
        return this.data.enabled;
    }

    isEnabled() {
        return this.data.enabled;
    }

    // ─── Trigger Matching ────────────────────────────────

    /**
     * Find a matching FAQ entry for the given message content
     * @param {string} content - message content
     * @param {string} channelId - channel ID for restriction check
     * @param {string[]} memberRoleIds - member role IDs for restriction check
     * @returns {Object|null} matched entry or null
     */
    findMatch(content, channelId = null, memberRoleIds = []) {
        if (!this.data.enabled) return null;

        const lowerContent = content.toLowerCase().trim();
        if (!lowerContent) return null;

        for (const entry of this.data.entries) {
            if (!entry.enabled) continue;

            // Channel restriction check
            if (entry.channels.length > 0 && channelId && !entry.channels.includes(channelId)) {
                continue;
            }

            // Role restriction check
            if (entry.roles.length > 0 && memberRoleIds.length > 0) {
                const hasRole = entry.roles.some(r => memberRoleIds.includes(r));
                if (!hasRole) continue;
            }

            // Cooldown check
            if (this.isOnCooldown(entry.id, channelId)) continue;

            // Try matching
            if (this.matchEntry(lowerContent, entry)) {
                return entry;
            }
        }

        return null;
    }

    /**
     * Test matching without cooldown or restriction checks
     */
    testMatch(content) {
        const lowerContent = content.toLowerCase().trim();
        const matches = [];

        for (const entry of this.data.entries) {
            if (this.matchEntry(lowerContent, entry)) {
                matches.push(entry);
            }
        }

        return matches;
    }

    /**
     * Internal: check if an entry matches the content
     */
    matchEntry(lowerContent, entry) {
        // Check triggers
        for (const trigger of entry.triggers) {
            const lowerTrigger = trigger.toLowerCase();

            if (entry.matchMode === 'exact') {
                if (lowerContent === lowerTrigger) return true;
            } else if (entry.matchMode === 'contains') {
                if (lowerContent.includes(lowerTrigger)) return true;
            } else if (entry.matchMode === 'phrase') {
                // Word boundary matching
                const regex = new RegExp(`\\b${this.escapeRegex(lowerTrigger)}\\b`, 'i');
                if (regex.test(lowerContent)) return true;
            }
        }

        // Check aliases
        for (const alias of entry.aliases) {
            const lowerAlias = alias.toLowerCase();
            // Aliases use word-boundary matching
            const regex = new RegExp(`\\b${this.escapeRegex(lowerAlias)}\\b`, 'i');
            if (regex.test(lowerContent)) return true;
        }

        // Optional fuzzy matching (basic Levenshtein for short inputs)
        if (lowerContent.split(/\s+/).length <= 5) {
            for (const trigger of entry.triggers) {
                if (this.fuzzyMatch(lowerContent, trigger.toLowerCase(), 2)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Fuzzy match using Levenshtein distance
     */
    fuzzyMatch(input, target, maxDistance) {
        if (Math.abs(input.length - target.length) > maxDistance) return false;

        const matrix = [];
        for (let i = 0; i <= input.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= target.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= input.length; i++) {
            for (let j = 1; j <= target.length; j++) {
                const cost = input[i - 1] === target[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[input.length][target.length] <= maxDistance;
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ─── Cooldowns ───────────────────────────────────────

    isOnCooldown(entryId, channelId) {
        const key = `faq_${entryId}_${channelId || 'global'}`;
        const lastUsed = this.cooldowns.get(key);
        if (!lastUsed) return false;

        const entry = this.data.entries.find(e => e.id === entryId);
        const cooldownMs = ((entry?.cooldown) || this.data.globalCooldown) * 1000;
        return (Date.now() - lastUsed) < cooldownMs;
    }

    setCooldown(entryId, channelId) {
        const key = `faq_${entryId}_${channelId || 'global'}`;
        this.cooldowns.set(key, Date.now());
    }

    // ─── Response Building ───────────────────────────────

    /**
     * Build the response payload for a matched FAQ entry
     * @param {Object} entry - the matched FAQ entry
     * @returns {Object} Discord message payload
     */
    buildResponse(entry) {
        const payload = {};

        if (entry.response.type === 'embed' && entry.response.embed) {
            const embedData = entry.response.embed;
            const embed = new EmbedBuilder()
                .setTitle(embedData.title || entry.category)
                .setDescription(embedData.description || entry.response.text)
                .setColor(embedData.color || '#5865F2')
                .setTimestamp();

            if (embedData.footer) {
                embed.setFooter({ text: embedData.footer });
            }

            if (embedData.fields && Array.isArray(embedData.fields)) {
                embed.addFields(embedData.fields);
            }

            payload.embeds = [embed];
        } else {
            payload.content = entry.response.text;
        }

        // Add buttons if configured
        if (entry.response.buttons && entry.response.buttons.length > 0) {
            const row = new ActionRowBuilder();
            for (const btn of entry.response.buttons.slice(0, 5)) {
                const button = new ButtonBuilder()
                    .setLabel(btn.label)
                    .setStyle(btn.url ? ButtonStyle.Link : ButtonStyle.Secondary);

                if (btn.url) {
                    button.setURL(btn.url);
                } else {
                    button.setCustomId(btn.customId || `faq_btn_${entry.id}`);
                }

                if (btn.emoji) button.setEmoji(btn.emoji);
                row.addComponents(button);
            }
            payload.components = [row];
        }

        return payload;
    }

    /**
     * Cleanup old cooldowns
     */
    cleanupCooldowns() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes
        for (const [key, timestamp] of this.cooldowns.entries()) {
            if (now - timestamp > maxAge) {
                this.cooldowns.delete(key);
            }
        }
    }
}

module.exports = new FaqService();
