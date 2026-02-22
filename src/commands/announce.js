const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const announcementTypes = require('../config/announcementTypes.json');
const announcementConfig = require('../config/announcementConfig.json');
const { buildAnnouncementEmbed } = require('../modules/embedBuilder');
const { buildActionRows } = require('../modules/buttonBuilder');
const permissionGuard = require('../modules/permissionGuard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Post a structured announcement')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The type of announcement to post')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(announcementTypes).map(key => ({ name: key, value: key }))
                ))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post in')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('banner')
                .setDescription('Override the default banner image URL'))
        .addRoleOption(option =>
            option.setName('mention_role')
                .setDescription('Role to mention in the announcement')),

    async execute(interaction) {
        // 1. Permission Check
        if (!permissionGuard.canPostAnnouncement(interaction.member)) {
            return interaction.reply({
                content: '⛔ You do not have permission to post announcements.',
                ephemeral: true
            });
        }

        // 2. System Enabled Check
        if (!announcementConfig.enabled) {
            return interaction.reply({
                content: '⚠️ The announcement system is currently disabled. Use `/announcement toggle on` to enable it.',
                ephemeral: true
            });
        }

        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');
        const banner = interaction.options.getString('banner');
        const role = interaction.options.getRole('mention_role');

        const config = announcementTypes[type];
        if (!config) {
            return interaction.reply({
                content: `❌ Invalid announcement type: ${type}`,
                ephemeral: true
            });
        }

        try {
            // 3. Build Components
            const embed = buildAnnouncementEmbed(config, { banner });
            const components = buildActionRows(config.buttons);

            // 4. Send Message
            const messagePayload = {
                embeds: [embed],
                components: components
            };

            if (role) {
                messagePayload.content = `<@&${role.id}>`;
            }

            await channel.send(messagePayload);

            // 5. Confirm
            await interaction.reply({
                content: `✅ **Announcement Posted!**\nType: \`${type}\`\nChannel: ${channel}`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Announcement Error:', error);
            await interaction.reply({
                content: '❌ Failed to post announcement. Check bot permissions in target channel.',
                ephemeral: true
            });
        }
    },
};
