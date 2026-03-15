const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const STORAGE_PATH = path.join(__dirname, '../storage/stickyNotes.json');

/**
 * Upgraded Sticky Note Service
 * Supports text/embed/component output, repost logic, toggle, preview
 */
class StickyService {
    constructor() {
        this.notes = {};
        this.cooldowns = new Set();
        this.messageCounters = new Map(); // channelId -> messages since last sticky
        this.client = null;
    }

    init(client) {
        this.client = client;
        this.loadNotes();
        console.log(`[Sticky] Loaded sticky notes for ${Object.keys(this.notes).length} channels.`);
    }

    // ─── Storage ─────────────────────────────────────────

    loadNotes() {
        try {
            if (fs.existsSync(STORAGE_PATH)) {
                const raw = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
                // Auto-migrate old format
                for (const [channelId, note] of Object.entries(raw)) {
                    if (!note.outputMode) {
                        // Old format migration
                        raw[channelId] = {
                            content: note.content,
                            outputMode: 'embed',
                            embedSettings: {
                                title: 'Sticky Note',
                                color: '#FFFF00',
                                footer: 'This message stays at the bottom.'
                            },
                            components: [],
                            cooldown: 5000,
                            repostThreshold: 1,
                            repostInterval: null,
                            active: true,
                            messageId: note.messageId || null,
                            lastPosted: note.lastPosted || null,
                            createdAt: note.createdAt || new Date().toISOString()
                        };
                    }
                }
                this.notes = raw;
            }
        } catch (error) {
            console.error('[Sticky] Failed to load notes:', error);
            this.notes = {};
        }
    }

    saveNotes() {
        try {
            const dir = path.dirname(STORAGE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.notes, null, 2));
        } catch (error) {
            console.error('[Sticky] Failed to save notes:', error);
        }
    }

    // ─── CRUD ────────────────────────────────────────────

    async createSticky(channelId, options) {
        this.notes[channelId] = {
            content: options.content,
            outputMode: options.outputMode || 'embed',
            embedSettings: options.embedSettings || {
                title: options.title || 'Sticky Note',
                color: options.color || '#FFFF00',
                footer: options.footer || 'This message stays at the bottom.'
            },
            components: options.components || [],
            cooldown: options.cooldown || 5000,
            repostThreshold: options.repostThreshold || 1,
            repostInterval: options.repostInterval || null,
            active: true,
            messageId: null,
            lastPosted: null,
            createdAt: new Date().toISOString()
        };
        this.messageCounters.set(channelId, 0);
        this.saveNotes();
        return this.notes[channelId];
    }

    updateSticky(channelId, updates) {
        if (!this.notes[channelId]) throw new Error('No sticky note in this channel.');
        for (const [key, value] of Object.entries(updates)) {
            this.notes[channelId][key] = value;
        }
        this.saveNotes();
        return this.notes[channelId];
    }

    getSticky(channelId) {
        return this.notes[channelId] || null;
    }

    deleteSticky(channelId) {
        if (!this.notes[channelId]) return false;
        delete this.notes[channelId];
        this.messageCounters.delete(channelId);
        this.saveNotes();
        return true;
    }

    toggleSticky(channelId) {
        if (!this.notes[channelId]) throw new Error('No sticky note in this channel.');
        this.notes[channelId].active = !this.notes[channelId].active;
        this.saveNotes();
        return this.notes[channelId].active;
    }

    listAllStickies() {
        return Object.entries(this.notes).map(([channelId, note]) => ({
            channelId,
            ...note
        }));
    }

    // ─── Message Handling ────────────────────────────────

    async handleMessage(message) {
        if (message.author.bot) return;

        const channelId = message.channel.id;
        const note = this.notes[channelId];
        if (!note || !note.active) return;

        // Increment message counter
        const count = (this.messageCounters.get(channelId) || 0) + 1;
        this.messageCounters.set(channelId, count);

        // Check if we should repost
        const shouldRepost = this.shouldRepost(channelId, note, count);
        if (!shouldRepost) return;

        // Cooldown check
        if (this.cooldowns.has(channelId)) return;
        this.cooldowns.add(channelId);
        setTimeout(() => this.cooldowns.delete(channelId), note.cooldown || 5000);

        try {
            // Delete previous sticky message
            if (note.messageId) {
                try {
                    const oldMsg = await message.channel.messages.fetch(note.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch (err) {
                    // Ignore — message might be gone
                }
            }

            // Build and send new sticky
            const payload = this.buildStickyPayload(note);
            const newMsg = await message.channel.send(payload);

            // Update state
            note.messageId = newMsg.id;
            note.lastPosted = new Date().toISOString();
            this.messageCounters.set(channelId, 0);
            this.saveNotes();
        } catch (error) {
            console.error(`[Sticky] Error in channel ${channelId}:`, error);
        }
    }

    shouldRepost(channelId, note, messageCount) {
        // Repost after X messages
        if (note.repostThreshold && messageCount >= note.repostThreshold) {
            return true;
        }

        // Repost after time interval (in minutes)
        if (note.repostInterval && note.lastPosted) {
            const elapsed = Date.now() - new Date(note.lastPosted).getTime();
            const intervalMs = note.repostInterval * 60 * 1000;
            if (elapsed >= intervalMs) return true;
        }

        return false;
    }

    // ─── Payload Building ────────────────────────────────

    buildStickyPayload(note) {
        const payload = {};

        if (note.outputMode === 'embed') {
            const embed = new EmbedBuilder()
                .setTitle(note.embedSettings?.title || 'Sticky Note')
                .setDescription(note.content)
                .setColor(note.embedSettings?.color || '#FFFF00')
                .setTimestamp();

            if (note.embedSettings?.footer) {
                embed.setFooter({ text: note.embedSettings.footer });
            }

            payload.embeds = [embed];
        } else {
            // Text mode
            payload.content = `📌 **Sticky Note**\n${note.content}`;
        }

        // Add button components if configured
        if (note.components && note.components.length > 0) {
            const row = new ActionRowBuilder();
            for (const comp of note.components.slice(0, 5)) {
                const button = new ButtonBuilder()
                    .setLabel(comp.label)
                    .setStyle(comp.url ? ButtonStyle.Link : ButtonStyle.Secondary);

                if (comp.url) {
                    button.setURL(comp.url);
                } else {
                    button.setCustomId(comp.customId || `sticky_btn_${Date.now()}`);
                }

                if (comp.emoji) button.setEmoji(comp.emoji);
                row.addComponents(button);
            }
            payload.components = [row];
        }

        return payload;
    }

    /**
     * Preview a sticky note without posting it
     */
    previewSticky(channelId) {
        const note = this.notes[channelId];
        if (!note) throw new Error('No sticky note in this channel.');
        return this.buildStickyPayload(note);
    }
}

module.exports = new StickyService();
