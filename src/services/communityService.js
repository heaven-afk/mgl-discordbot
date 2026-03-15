const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CONFIG_PATH = path.join(__dirname, '../storage/communityConfig.json');

const VALID_CATEGORIES = ['rules', 'banned_weapons', 'registration', 'stream', 'ranking', 'transfer', 'tier', 'event_format'];

const CATEGORY_LABELS = {
    rules: '📜 Rules',
    banned_weapons: '🚫 Banned Weapons',
    registration: '📋 Registration',
    stream: '📺 Stream',
    ranking: '🏆 Ranking',
    transfer: '🔄 Transfer Window',
    tier: '🎯 Tier Info',
    event_format: '🎮 Event Format'
};

/**
 * Community Info Service
 * Centralized manager for all community information categories
 */
class CommunityService {
    constructor() {
        this.config = {};
        this.load();
    }

    // ─── Storage ─────────────────────────────────────────

    load() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                this.config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            } else {
                this.config = {};
                this.save();
            }
        } catch (error) {
            console.error('[Community] Error loading config:', error);
            this.config = {};
        }
    }

    save() {
        try {
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('[Community] Error saving config:', error);
        }
    }

    // ─── CRUD ────────────────────────────────────────────

    getInfo(category) {
        return this.config[category] || null;
    }

    setInfo(category, data) {
        if (!VALID_CATEGORIES.includes(category)) {
            throw new Error(`Invalid category: ${category}. Valid: ${VALID_CATEGORIES.join(', ')}`);
        }

        this.config[category] = {
            ...this.config[category],
            ...data
        };
        this.save();
        return this.config[category];
    }

    listCategories() {
        return VALID_CATEGORIES.map(cat => ({
            key: cat,
            label: CATEGORY_LABELS[cat],
            enabled: this.config[cat]?.enabled ?? false,
            hasContent: !!this.config[cat]?.content
        }));
    }

    // ─── Registration-specific ───────────────────────────

    getRegistrationInfo() {
        const reg = this.config.registration;
        if (!reg) return null;
        return {
            ...reg,
            channelMention: reg.channelId ? `<#${reg.channelId}>` : 'Not configured',
            threadMention: reg.threadId ? `<#${reg.threadId}>` : null
        };
    }

    setRegistrationConfig(updates) {
        this.config.registration = {
            ...this.config.registration,
            ...updates
        };
        this.save();
        return this.config.registration;
    }

    // ─── Embed Builders ──────────────────────────────────

    buildInfoEmbed(category) {
        const info = this.config[category];
        if (!info) {
            return new EmbedBuilder()
                .setTitle('❌ Not Configured')
                .setDescription(`No information has been configured for **${CATEGORY_LABELS[category] || category}**.\n\nAn admin can configure this using \`/community setup\`.`)
                .setColor('#E74C3C');
        }

        const embed = new EmbedBuilder()
            .setTitle(info.title || CATEGORY_LABELS[category] || category)
            .setDescription(info.content || info.description || 'No content available.')
            .setColor(info.color || '#5865F2')
            .setTimestamp();

        // Add links as fields if any
        if (info.links && info.links.length > 0) {
            const linksText = info.links.map(l => `[${l.label}](${l.url})`).join('\n');
            embed.addFields({ name: '🔗 Links', value: linksText });
        }

        // Add channel reference if set
        if (info.channelId) {
            embed.addFields({ name: '📍 Channel', value: `<#${info.channelId}>`, inline: true });
        }

        // Registration-specific fields
        if (category === 'registration') {
            if (info.deadline) {
                embed.addFields({ name: '⏰ Deadline', value: info.deadline, inline: true });
            }
            if (info.template) {
                embed.addFields({ name: '📝 Template', value: `\`\`\`\n${info.template}\n\`\`\`` });
            }
            if (info.threadId) {
                embed.addFields({ name: '📌 Registration Thread', value: `<#${info.threadId}>`, inline: true });
            }
        }

        return embed;
    }

    buildOverviewEmbed() {
        const categories = this.listCategories();

        const embed = new EmbedBuilder()
            .setTitle('📚 Community Information Hub')
            .setDescription('Use the buttons below or the subcommands to access community info.\n\n**Available categories:**')
            .setColor('#5865F2')
            .setTimestamp();

        for (const cat of categories) {
            const status = cat.hasContent ? '✅' : '⚠️';
            embed.addFields({
                name: `${status} ${cat.label}`,
                value: `\`/community ${cat.key.replace('_', '-')}\``,
                inline: true
            });
        }

        return embed;
    }

    buildInfoButtons() {
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let count = 0;

        for (const cat of VALID_CATEGORIES) {
            if (count > 0 && count % 4 === 0) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            const button = new ButtonBuilder()
                .setCustomId(`community_info_${cat}`)
                .setLabel(CATEGORY_LABELS[cat]?.replace(/^[^\s]+\s/, '') || cat)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(CATEGORY_LABELS[cat]?.split(' ')[0] || '📌');

            currentRow.addComponents(button);
            count++;
        }

        if (currentRow.components.length > 0) {
            rows.push(currentRow);
        }

        return rows;
    }
}

module.exports = new CommunityService();
