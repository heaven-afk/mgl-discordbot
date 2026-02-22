const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../storage/smartConfig.json');

const DEFAULT_CONFIG = {
    enabled: false,
    auto: false,
    manual_allowed: true,
    memory: 'off',
    context_limit: 25,
    cooldown_user: 30,
    cooldown_channel: 20,
    cooldown_auto_user: 60,
    allow_list: [],
    block_list: [],
    triggers: {
        mention: true,
        reply_to_bot: true,
        prefix: 'off',
        keywords: 'off'
    },
    admin_roles: [],
    persona: 'default', // default, pirate, sarcastic, helpful, professional
    system_prompt_override: null
};

/**
 * Smart configuration manager
 */
class SmartConfig {
    constructor() {
        this.config = null;
        this.load();
    }

    /**
     * Load configuration from file
     */
    load() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const data = fs.readFileSync(CONFIG_PATH, 'utf8');
                this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
            } else {
                this.config = { ...DEFAULT_CONFIG };
                this.save();
            }
        } catch (error) {
            console.error('[Smart Config] Error loading config:', error);
            this.config = { ...DEFAULT_CONFIG };
        }
    }

    /**
     * Save configuration to file
     */
    save() {
        try {
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('[Smart Config] Error saving config:', error);
        }
    }

    /**
     * Get configuration value
     */
    get(key) {
        return this.config[key];
    }

    /**
     * Set configuration value
     */
    set(key, value) {
        this.config[key] = value;
        this.save();
    }

    /**
     * Get all configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Update multiple settings
     */
    update(settings) {
        this.config = { ...this.config, ...settings };
        this.save();
    }

    /**
     * Add to allow list
     */
    addToAllowList(channelId) {
        if (!this.config.allow_list.includes(channelId)) {
            this.config.allow_list.push(channelId);
            this.save();
        }
    }

    /**
     * Add to block list
     */
    addToBlockList(channelId) {
        if (!this.config.block_list.includes(channelId)) {
            this.config.block_list.push(channelId);
            this.save();
        }
    }

    /**
     * Remove from allow list
     */
    removeFromAllowList(channelId) {
        this.config.allow_list = this.config.allow_list.filter(id => id !== channelId);
        this.save();
    }

    /**
     * Remove from block list
     */
    removeFromBlockList(channelId) {
        this.config.block_list = this.config.block_list.filter(id => id !== channelId);
        this.save();
    }

    /**
     * Check if channel is allowed
     */
    isChannelAllowed(channelId) {
        // Block list overrides allow list
        if (this.config.block_list.includes(channelId)) {
            return false;
        }

        // If allow list is empty, all channels are allowed
        if (this.config.allow_list.length === 0) {
            return true;
        }

        return this.config.allow_list.includes(channelId);
    }

    /**
     * Update triggers
     */
    updateTriggers(triggers) {
        this.config.triggers = { ...this.config.triggers, ...triggers };
        this.save();
    }

    /**
     * Get system prompt for current persona
     */
    getPersonaSystemPrompt() {
        if (this.config.system_prompt_override) {
            return this.config.system_prompt_override;
        }

        const personas = {
            default: "You are a helpful Discord bot assistant. Be concise, friendly, and helpful.",
            pirate: "You are a salty pirate bot! Speak like a pirate (Yarrr!), use nautical terms, but still be helpful.",
            sarcastic: "You are a sarcastic senior developer bot. Give correct answers but with a dry, witty, slightly condescending tone.",
            helpful: "You are an extremely enthusiastic and polite assistant! Use emojis and be very encouraging.",
            professional: "You are a professional corporate assistant. Use formal language, no slang, and be very precise.",
            uwu: "You are a cute anime bot. Use uwu speak, kaomojis, and be very shy but helpful."
        };

        return personas[this.config.persona] || personas.default;
    }
}

module.exports = new SmartConfig();
