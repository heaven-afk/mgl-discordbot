const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create a professional embed — paste your message and the bot formats it')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to post the embed in (defaults to current)'))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Embed color')
                .addChoices(
                    { name: 'Blue (Default)', value: '#5865F2' },
                    { name: 'Red', value: '#ED4245' },
                    { name: 'Green', value: '#57F287' },
                    { name: 'Yellow', value: '#FEE75C' },
                    { name: 'Orange', value: '#F47B20' },
                    { name: 'Purple', value: '#9B59B6' },
                    { name: 'White', value: '#FFFFFF' },
                    { name: 'Black', value: '#000000' }
                ))
        .addRoleOption(option =>
            option.setName('mention_role')
                .setDescription('Role to mention alongside the embed')),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const role = interaction.options.getRole('mention_role');
        const color = interaction.options.getString('color') || '#5865F2';

        // Encode options into customId
        const customId = `embed_create_${channel.id}_${role ? role.id : 'none'}_${color.replace('#', '')}`;

        const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle('Create Embed');

        // Single content field — bot will auto-detect structure
        const contentInput = new TextInputBuilder()
            .setCustomId('embed_content')
            .setLabel('Paste your full message here')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Paste your message — headings and sections are auto-detected')
            .setRequired(true)
            .setMaxLength(4000);

        // Optional image URL
        const imageInput = new TextInputBuilder()
            .setCustomId('embed_image')
            .setLabel('Image URL (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://example.com/banner.png')
            .setRequired(false);

        // Optional footer
        const footerInput = new TextInputBuilder()
            .setCustomId('embed_footer')
            .setLabel('Footer (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Major Gaming League')
            .setRequired(false)
            .setMaxLength(2048);

        modal.addComponents(
            new ActionRowBuilder().addComponents(contentInput),
            new ActionRowBuilder().addComponents(imageInput),
            new ActionRowBuilder().addComponents(footerInput)
        );

        await interaction.showModal(modal);
    },

    /**
     * Parses raw text into structured embed sections.
     * 
     * Detection rules:
     * - First line = Title (if followed by blank line or is clearly a heading)
     * - Lines starting with emoji + text on their own = Section headings (embed fields)
     * - Lines starting with **text** on their own = Section headings
     * - Lines starting with # = Section headings (markdown style)
     * - Content under headings = Field values
     * - Content before first heading = Description
     */
    parseContent(rawContent) {
        const lines = rawContent.split('\n');
        const result = {
            title: null,
            description: '',
            fields: []
        };

        // Regex patterns for heading detection
        // Matches: emoji + text, **bold text**, # markdown headers, ALL CAPS headers
        const headingPatterns = [
            /^#{1,3}\s+(.+)$/,                          // # Heading, ## Heading
            /^\*\*(.+)\*\*\s*$/,                         // **Bold Heading**
            /^__(.+)__\s*$/,                              // __Underline Heading__
            /^([\p{Emoji_Presentation}\p{Emoji}\u200d]+\s*.{2,})\s*$/u,  // 🛡️ Heading with emoji prefix
        ];

        function isHeading(line) {
            const trimmed = line.trim();
            if (!trimmed) return false;
            for (const pattern of headingPatterns) {
                if (pattern.test(trimmed)) return true;
            }
            return false;
        }

        function cleanHeading(line) {
            const trimmed = line.trim();
            // Remove markdown # prefix
            const mdMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
            if (mdMatch) return mdMatch[1];
            // Remove bold markers
            const boldMatch = trimmed.match(/^\*\*(.+)\*\*\s*$/);
            if (boldMatch) return boldMatch[1];
            // Remove underline markers  
            const underlineMatch = trimmed.match(/^__(.+)__\s*$/);
            if (underlineMatch) return underlineMatch[1];
            // Return as-is (emoji headings keep their emoji)
            return trimmed;
        }

        // Step 1: Detect title (first non-empty line if followed by a blank line)
        let startIndex = 0;

        // Skip leading blank lines
        while (startIndex < lines.length && !lines[startIndex].trim()) {
            startIndex++;
        }

        if (startIndex < lines.length) {
            const firstLine = lines[startIndex].trim();
            const nextLine = startIndex + 1 < lines.length ? lines[startIndex + 1].trim() : '';

            // First line is title if:
            // - Next line is empty (title + gap + content pattern)
            // - It's a heading-style line
            // - It's short enough to be a title (< 100 chars)
            if (firstLine.length < 100 && (nextLine === '' || isHeading(firstLine))) {
                result.title = cleanHeading(firstLine);
                startIndex++;
                // Skip blank line after title
                if (startIndex < lines.length && !lines[startIndex].trim()) {
                    startIndex++;
                }
            }
        }

        // Step 2: Parse remaining content into description + fields
        let currentField = null;
        let descriptionLines = [];

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (isHeading(trimmed)) {
                // Save previous field if exists
                if (currentField) {
                    result.fields.push({
                        name: currentField.name,
                        value: currentField.lines.join('\n').trim() || '\u200b'
                    });
                }

                // Start new field
                currentField = {
                    name: cleanHeading(trimmed),
                    lines: []
                };
            } else if (currentField) {
                // We're inside a field, add content to it
                currentField.lines.push(line);
            } else {
                // Before first heading — this is description content
                descriptionLines.push(line);
            }
        }

        // Save last field
        if (currentField) {
            result.fields.push({
                name: currentField.name,
                value: currentField.lines.join('\n').trim() || '\u200b'
            });
        }

        result.description = descriptionLines.join('\n').trim();

        // If no title was found and no fields, just use everything as description
        if (!result.title && result.fields.length === 0 && !result.description) {
            result.description = rawContent;
        }

        return result;
    },

    /**
     * Handle the modal submission for embed creation
     */
    async handleModal(interaction) {
        const customId = interaction.customId;
        const parts = customId.split('_');
        // Format: embed_create_<channelId>_<roleId|none>_<colorHex>
        const channelId = parts[2];
        const roleId = parts[3] !== 'none' ? parts[3] : null;
        const colorHex = parts[4] ? `#${parts[4]}` : '#5865F2';

        const rawContent = interaction.fields.getTextInputValue('embed_content');
        const imageUrl = interaction.fields.getTextInputValue('embed_image');
        const footer = interaction.fields.getTextInputValue('embed_footer');

        try {
            await interaction.deferReply({ ephemeral: true });

            // Auto-parse the content
            const parsed = this.parseContent(rawContent);

            // Build embed
            const embed = new EmbedBuilder()
                .setColor(colorHex)
                .setTimestamp();

            if (parsed.title) {
                embed.setTitle(parsed.title);
            }

            if (parsed.description) {
                embed.setDescription(parsed.description);
            }

            // Add detected fields/sections
            if (parsed.fields.length > 0) {
                for (const field of parsed.fields) {
                    // Truncate field values to Discord limit
                    const value = field.value.length > 1024
                        ? field.value.substring(0, 1021) + '...'
                        : field.value;
                    embed.addFields({ name: field.name, value: value || '\u200b' });
                }
            }

            if (imageUrl && imageUrl.startsWith('http')) {
                embed.setImage(imageUrl);
            }

            if (footer) {
                embed.setFooter({ text: footer });
            }

            // Get target channel
            const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                return interaction.editReply({ content: '❌ Target channel not found.' });
            }

            // Send
            const payload = { embeds: [embed] };
            if (roleId) {
                payload.content = `<@&${roleId}>`;
            }

            await channel.send(payload);

            await interaction.editReply({
                content: `✅ Embed posted in ${channel}.`
            });

        } catch (error) {
            console.error('Embed creation error:', error);
            await interaction.editReply({
                content: '❌ Failed to post embed. Check bot permissions in the target channel.'
            });
        }
    }
};
