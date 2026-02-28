const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

/**
 * Message JSON Viewer Command
 * Allows admins/mods to fetch the raw JSON of a Discord message.
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('json')
        .setDescription('Fetch the raw message object formatted as JSON')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Message link or ID')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where the message is (if using ID and not in the same channel)'))
        .addBooleanOption(option =>
            option.setName('ephemeral')
                .setDescription('Whether to respond ephemerally (default: true)')),

    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
        await interaction.deferReply({ ephemeral });

        // 1. Permissions Check (User)
        const hasManageMessages = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasManageMessages && !isAdmin) {
            return interaction.editReply({
                content: '⛔ You need `Manage Messages` or `Administrator` permission to use this command.'
            });
        }

        const target = interaction.options.getString('target');
        const providedChannel = interaction.options.getChannel('channel');

        let channelId, messageId;

        // 2. Parse target (Link vs ID)
        // Regex for: https://discord.com/channels/123/456/789
        const linkRegex = /https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/\d+\/(\d+)\/(\d+)/;
        const match = target.match(linkRegex);

        if (match) {
            channelId = match[1];
            messageId = match[2];
        } else {
            // Assume it's a message ID (standard Snowflake is 17-20 digits)
            if (!/^\d{17,20}$/.test(target)) {
                return interaction.editReply({ content: '❌ Invalid message link or ID format.' });
            }
            messageId = target;
            channelId = providedChannel?.id || interaction.channelId;
        }

        try {
            // 3. Fetch Channel & Check Bot Permissions
            const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                return interaction.editReply({ content: '❌ Channel not found or I don\'t have access.' });
            }

            const botPerms = channel.permissionsFor(interaction.client.user);
            if (!botPerms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
                return interaction.editReply({
                    content: '❌ I don\'t have permission to view that channel or read its message history.'
                });
            }

            // 4. Fetch Message
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return interaction.editReply({ content: '❌ Message not found.' });
            }

            // 5. Construct JSON-safe object
            // Selecting and structuring fields as per requirements
            const jsonObject = {
                id: message.id,
                content: message.content,
                author: {
                    id: message.author.id,
                    username: message.author.username,
                    discriminator: message.author.discriminator !== '0' ? message.author.discriminator : null,
                    bot: message.author.bot,
                    system: message.author.system
                },
                timestamp: message.createdAt.toISOString(),
                editedTimestamp: message.editedAt?.toISOString() || null,
                channelId: message.channelId,
                guildId: message.guildId,
                pinned: message.pinned,
                tts: message.tts,
                type: message.type,
                flags: message.flags.toJSON(),
                nonce: message.nonce,
                attachments: message.attachments.map(a => ({
                    id: a.id,
                    url: a.url,
                    proxyUrl: a.proxyURL,
                    filename: a.name,
                    size: a.size,
                    contentType: a.contentType,
                    description: a.description,
                    width: a.width,
                    height: a.height
                })),
                embeds: message.embeds.map(e => e.data),
                mentions: {
                    users: message.mentions.users.map(u => ({ id: u.id, username: u.username })),
                    roles: message.mentions.roles.map(r => ({ id: r.id, name: r.name })),
                    channels: message.mentions.channels.map(c => ({ id: c.id, name: c.name }))
                },
                components: message.components.map(c => c.toJSON()),
                reactions: message.reactions.cache.map(r => ({
                    emoji: r.emoji.name || r.emoji.id,
                    count: r.count,
                    me: r.me
                })),
                reference: message.reference ? {
                    messageId: message.reference.messageId,
                    channelId: message.reference.channelId,
                    guildId: message.reference.guildId
                } : null,
                interaction: message.interaction ? {
                    id: message.interaction.id,
                    type: message.interaction.type,
                    name: message.interaction.commandName,
                    user: {
                        id: message.interaction.user.id,
                        username: message.interaction.user.username
                    }
                } : null
            };

            const jsonString = JSON.stringify(jsonObject, null, 2);

            // 6. Log usage (userId, guildId, channelId, messageId, timestamp)
            console.log(`[JSON_VIEWER] User: ${interaction.user.tag} (${interaction.user.id}) | Guild: ${interaction.guildId} | Channel: ${channelId} | Msg: ${messageId} | TS: ${new Date().toISOString()}`);

            // 7. Send Result
            if (jsonString.length <= 1800) {
                await interaction.editReply({
                    content: `**Raw Message JSON:**\n\`\`\`json\n${jsonString}\n\`\`\``
                });
            } else {
                const buffer = Buffer.from(jsonString, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { name: `message-${messageId}.json` });
                await interaction.editReply({
                    content: `📦 The message JSON is too large for Discord to display (${(jsonString.length / 1024).toFixed(1)} KB). Sending as a file attachment:`,
                    files: [attachment]
                });
            }

        } catch (error) {
            console.error('[JSON Command Error]', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching the message JSON. Please check my permissions or the target ID/link.'
            });
        }
    },
};
