const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const STORAGE_PATH = path.join(__dirname, '../storage/stickyNotes.json');

class StickyService {
    constructor() {
        this.notes = {};
        this.cooldowns = new Set();
        this.client = null;
    }

    init(client) {
        this.client = client;
        this.loadNotes();
        console.log(`Loaded sticky notes for ${Object.keys(this.notes).length} channels.`);
    }

    loadNotes() {
        try {
            if (fs.existsSync(STORAGE_PATH)) {
                this.notes = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
            }
        } catch (error) {
            console.error('Failed to load sticky notes:', error);
            this.notes = {};
        }
    }

    saveNotes() {
        try {
            // Ensure directory exists
            const dir = path.dirname(STORAGE_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.notes, null, 2));
        } catch (error) {
            console.error('Failed to save sticky notes:', error);
        }
    }

    async setSticky(channelId, content) {
        this.notes[channelId] = {
            content,
            messageId: null,
            createdAt: new Date().toISOString(),
            lastPosted: null
        };
        this.saveNotes();
    }

    getSticky(channelId) {
        return this.notes[channelId];
    }

    deleteSticky(channelId) {
        if (this.notes[channelId]) {
            delete this.notes[channelId];
            this.saveNotes();
            return true;
        }
        return false;
    }

    async handleMessage(message) {
        if (message.author.bot) return; // Ignore bots
        if (!this.notes[message.channel.id]) return; // Not a sticky channel

        const channelId = message.channel.id;

        // Cooldown check (5000ms)
        if (this.cooldowns.has(channelId)) return;

        this.cooldowns.add(channelId);
        setTimeout(() => this.cooldowns.delete(channelId), 5000);

        const note = this.notes[channelId];

        try {
            // Delete previous sticky message if it exists
            if (note.messageId) {
                try {
                    const oldMsg = await message.channel.messages.fetch(note.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch (err) {
                    // Ignore delete errors (msg might be gone)
                }
            }

            // Send new sticky message
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00) // Yellow
                .setTitle('Sticky Note')
                .setDescription(note.content)
                .setFooter({ text: 'This message stays at the bottom.' });

            const newMsg = await message.channel.send({ embeds: [embed] });

            // Update state
            note.messageId = newMsg.id;
            note.lastPosted = new Date().toISOString();
            this.saveNotes();

        } catch (error) {
            console.error(`Failed to handle sticky note for channel ${channelId}:`, error);
        }
    }
}

module.exports = new StickyService();
