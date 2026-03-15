const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const faqService = require('../services/faqService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('faq')
        .setDescription('Manage the FAQ auto-reply system')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a new FAQ entry')
                .addStringOption(opt =>
                    opt.setName('id').setDescription('Unique ID for this entry (e.g. "transfer_window")').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('category').setDescription('Category name (e.g. "Registration")').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('triggers').setDescription('Comma-separated trigger phrases').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('response').setDescription('Response text').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('aliases').setDescription('Comma-separated aliases (optional)'))
                .addStringOption(opt =>
                    opt.setName('match_mode').setDescription('Match mode')
                        .addChoices(
                            { name: 'Contains', value: 'contains' },
                            { name: 'Exact', value: 'exact' },
                            { name: 'Phrase (word boundary)', value: 'phrase' }
                        ))
                .addBooleanOption(opt =>
                    opt.setName('use_embed').setDescription('Send response as an embed (default: true)'))
                .addStringOption(opt =>
                    opt.setName('embed_color').setDescription('Embed color hex (e.g. #3498DB)'))
                .addIntegerOption(opt =>
                    opt.setName('cooldown').setDescription('Cooldown in seconds (default: 30)').setMinValue(5).setMaxValue(300))
        )
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Edit an existing FAQ entry')
                .addStringOption(opt =>
                    opt.setName('id').setDescription('Entry ID to edit').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('triggers').setDescription('New comma-separated trigger phrases'))
                .addStringOption(opt =>
                    opt.setName('response').setDescription('New response text'))
                .addStringOption(opt =>
                    opt.setName('aliases').setDescription('New comma-separated aliases'))
                .addStringOption(opt =>
                    opt.setName('category').setDescription('New category name'))
                .addStringOption(opt =>
                    opt.setName('match_mode').setDescription('New match mode')
                        .addChoices(
                            { name: 'Contains', value: 'contains' },
                            { name: 'Exact', value: 'exact' },
                            { name: 'Phrase (word boundary)', value: 'phrase' }
                        ))
                .addIntegerOption(opt =>
                    opt.setName('cooldown').setDescription('New cooldown in seconds').setMinValue(5).setMaxValue(300))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a FAQ entry')
                .addStringOption(opt =>
                    opt.setName('id').setDescription('Entry ID to remove').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all FAQ entries')
        )
        .addSubcommand(sub =>
            sub.setName('test')
                .setDescription('Test FAQ trigger matching')
                .addStringOption(opt =>
                    opt.setName('input').setDescription('Message text to test against triggers').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('toggle')
                .setDescription('Toggle a FAQ entry or the whole system on/off')
                .addStringOption(opt =>
                    opt.setName('id').setDescription('Entry ID to toggle (omit to toggle whole system)'))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // Public subcommands: list, test
        // Admin subcommands: add, edit, remove, toggle
        const adminSubs = ['add', 'edit', 'remove', 'toggle'];

        if (adminSubs.includes(sub)) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: '❌ You need `Manage Guild` permission to manage FAQ entries.',
                    ephemeral: true
                });
            }
        }

        switch (sub) {
            case 'add': return this.handleAdd(interaction);
            case 'edit': return this.handleEdit(interaction);
            case 'remove': return this.handleRemove(interaction);
            case 'list': return this.handleList(interaction);
            case 'test': return this.handleTest(interaction);
            case 'toggle': return this.handleToggle(interaction);
        }
    },

    async handleAdd(interaction) {
        const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
        const category = interaction.options.getString('category');
        const triggers = interaction.options.getString('triggers').split(',').map(t => t.trim()).filter(Boolean);
        const responseText = interaction.options.getString('response');
        const aliases = interaction.options.getString('aliases')?.split(',').map(a => a.trim()).filter(Boolean) || [];
        const matchMode = interaction.options.getString('match_mode') || 'contains';
        const useEmbed = interaction.options.getBoolean('use_embed') ?? true;
        const embedColor = interaction.options.getString('embed_color') || '#5865F2';
        const cooldown = interaction.options.getInteger('cooldown') || 30;

        try {
            const response = useEmbed ? {
                type: 'embed',
                text: responseText,
                embed: {
                    title: `📌 ${category}`,
                    description: responseText,
                    color: embedColor,
                    footer: `FAQ: ${category}`
                }
            } : {
                type: 'text',
                text: responseText
            };

            const entry = faqService.addEntry({
                id, category, triggers, aliases, matchMode,
                response, cooldown, channels: [], roles: [], enabled: true
            });

            const embed = new EmbedBuilder()
                .setTitle('✅ FAQ Entry Added')
                .setColor('#2ECC71')
                .addFields(
                    { name: 'ID', value: `\`${entry.id}\``, inline: true },
                    { name: 'Category', value: entry.category, inline: true },
                    { name: 'Match Mode', value: entry.matchMode, inline: true },
                    { name: 'Triggers', value: entry.triggers.map(t => `\`${t}\``).join(', ') },
                    { name: 'Cooldown', value: `${entry.cooldown}s`, inline: true },
                    { name: 'Type', value: entry.response.type, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    },

    async handleEdit(interaction) {
        const id = interaction.options.getString('id');
        const updates = {};

        const triggers = interaction.options.getString('triggers');
        if (triggers) updates.triggers = triggers.split(',').map(t => t.trim()).filter(Boolean);

        const responseText = interaction.options.getString('response');
        if (responseText) {
            const existing = faqService.getEntry(id);
            if (existing && existing.response.type === 'embed') {
                updates.response = {
                    ...existing.response,
                    text: responseText,
                    embed: { ...existing.response.embed, description: responseText }
                };
            } else {
                updates.response = { type: 'text', text: responseText };
            }
        }

        const aliases = interaction.options.getString('aliases');
        if (aliases) updates.aliases = aliases.split(',').map(a => a.trim()).filter(Boolean);

        const category = interaction.options.getString('category');
        if (category) updates.category = category;

        const matchMode = interaction.options.getString('match_mode');
        if (matchMode) updates.matchMode = matchMode;

        const cooldown = interaction.options.getInteger('cooldown');
        if (cooldown) updates.cooldown = cooldown;

        if (Object.keys(updates).length === 0) {
            return interaction.reply({ content: '❌ No changes specified.', ephemeral: true });
        }

        try {
            const entry = faqService.editEntry(id, updates);
            await interaction.reply({
                content: `✅ Updated FAQ entry \`${entry.id}\`: ${Object.keys(updates).join(', ')}`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    },

    async handleRemove(interaction) {
        const id = interaction.options.getString('id');

        try {
            const removed = faqService.removeEntry(id);
            await interaction.reply({
                content: `✅ Removed FAQ entry \`${removed.id}\` (${removed.category}).`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    },

    async handleList(interaction) {
        const entries = faqService.listEntries();

        if (entries.length === 0) {
            return interaction.reply({ content: 'No FAQ entries configured.', ephemeral: true });
        }

        const systemEnabled = faqService.isEnabled();

        // Paginate: 6 entries per page
        const perPage = 6;
        const pages = [];

        for (let i = 0; i < entries.length; i += perPage) {
            const page = entries.slice(i, i + perPage);
            const embed = new EmbedBuilder()
                .setTitle(`📋 FAQ Entries (${i + 1}–${Math.min(i + perPage, entries.length)} of ${entries.length})`)
                .setColor(systemEnabled ? '#5865F2' : '#95A5A6')
                .setDescription(systemEnabled ? '✅ FAQ System is **enabled**' : '❌ FAQ System is **disabled**')
                .setTimestamp();

            for (const entry of page) {
                const status = entry.enabled ? '✅' : '❌';
                embed.addFields({
                    name: `${status} ${entry.category} — \`${entry.id}\``,
                    value: `**Triggers:** ${entry.triggers.slice(0, 3).map(t => `\`${t}\``).join(', ')}${entry.triggers.length > 3 ? ` +${entry.triggers.length - 3} more` : ''}\n**Mode:** ${entry.matchMode} | **Cooldown:** ${entry.cooldown}s`,
                    inline: false
                });
            }

            pages.push(embed);
        }

        // Send first page (pagination with buttons could be added later)
        await interaction.reply({ embeds: [pages[0]], ephemeral: true });
    },

    async handleTest(interaction) {
        const input = interaction.options.getString('input');
        const matches = faqService.testMatch(input);

        if (matches.length === 0) {
            return interaction.reply({
                content: `🔍 No FAQ matches for: \`${input}\``,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 FAQ Match Test Results')
            .setColor('#3498DB')
            .setDescription(`Input: \`${input}\``)
            .setTimestamp();

        for (const match of matches.slice(0, 5)) {
            embed.addFields({
                name: `✅ ${match.category} — \`${match.id}\``,
                value: `Triggers: ${match.triggers.slice(0, 3).map(t => `\`${t}\``).join(', ')}\nEnabled: ${match.enabled ? 'Yes' : 'No'}`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleToggle(interaction) {
        const id = interaction.options.getString('id');

        if (!id) {
            const newState = faqService.toggleSystem();
            return interaction.reply({
                content: `${newState ? '✅' : '❌'} FAQ system is now **${newState ? 'enabled' : 'disabled'}**.`,
                ephemeral: true
            });
        }

        try {
            const entry = faqService.toggleEntry(id);
            await interaction.reply({
                content: `${entry.enabled ? '✅' : '❌'} FAQ entry \`${entry.id}\` is now **${entry.enabled ? 'enabled' : 'disabled'}**.`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    }
};
