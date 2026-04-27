const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'storage', 'autoreactConfig.json');

// In-memory cache — survives Render's ephemeral filesystem between deploys
let channelCache = {};

// Load from disk on startup (if file exists)
function loadFromDisk() {
    try {
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            channelCache = data.channels || {};
        }
    } catch (e) {
        console.warn('[AutoReact] Could not load config from disk:', e.message);
    }
}

function saveToDisk() {
    try {
        if (!fs.existsSync(path.dirname(configPath))) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify({ channels: channelCache }, null, 2));
    } catch (e) {
        console.warn('[AutoReact] Could not save config to disk:', e.message);
    }
}

// Load on module init
loadFromDisk();

module.exports = {
    addChannel(channelId, emoji) {
        channelCache[channelId] = emoji;
        saveToDisk();
        console.log(`[AutoReact] Added channel ${channelId} with emoji: ${emoji}`);
    },
    removeChannel(channelId) {
        if (channelCache[channelId]) {
            delete channelCache[channelId];
            saveToDisk();
            console.log(`[AutoReact] Removed channel ${channelId}`);
            return true;
        }
        return false;
    },
    getChannels() {
        return { ...channelCache };
    },
    async handleMessage(message) {
        if (message.author.bot) return;

        const emoji = channelCache[message.channel.id];
        if (!emoji) return;

        try {
            await message.react(emoji);
        } catch (error) {
            console.error(`[AutoReact] Failed to react in channel ${message.channel.id} with emoji "${emoji}":`, error.message);
            
            // If the emoji is invalid (e.g. bot doesn't have access to it), log clearly
            if (error.code === 10014) {
                console.error(`[AutoReact] Emoji "${emoji}" is unknown. Make sure the bot is in the server that owns this emoji.`);
            }
        }
    }
};
