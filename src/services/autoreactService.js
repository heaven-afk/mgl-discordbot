const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'storage', 'autoreactConfig.json');

// Ensure config exists
if (!fs.existsSync(configPath)) {
    if (!fs.existsSync(path.dirname(configPath))) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify({ channels: {} }, null, 2));
}

function getConfig() {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = {
    addChannel(channelId, emoji) {
        const config = getConfig();
        if (!config.channels) config.channels = {};
        config.channels[channelId] = emoji;
        saveConfig(config);
    },
    removeChannel(channelId) {
        const config = getConfig();
        if (config.channels && config.channels[channelId]) {
            delete config.channels[channelId];
            saveConfig(config);
            return true;
        }
        return false;
    },
    getChannels() {
        return getConfig().channels || {};
    },
    async handleMessage(message) {
        if (message.author.bot) return;
        const config = getConfig();
        const channels = config.channels || {};
        
        if (channels[message.channel.id]) {
            try {
                await message.react(channels[message.channel.id]);
            } catch (error) {
                console.error(`[AutoReact] Failed to react in channel ${message.channel.id}:`, error);
            }
        }
    }
};
