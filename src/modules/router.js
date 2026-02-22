const { EmbedBuilder } = require('discord.js');
const announcementConfig = require('../config/announcementConfig.json');

/**
 * Routes a modal submission to the configured review channel
 * @param {Client} client - Discord client
 * @param {String} type - The type of submission (recruitment, security, appeal)
 * @param {Object} submissionData - The key-value pairs from the modal
 * @param {User} user - The user who submitted
 * @param {Guild} guild - The guild where it was submitted
 * @returns {Promise<Message>} The sent message object
 */
async function routeSubmission(client, type, submissionData, user, guild) {
    // 1. Get Log Channel ID
    const channelId = announcementConfig.review_channels[type];
    if (!channelId || channelId.includes('REPLACE')) {
        throw new Error(`Review channel not configured for type: ${type}`);
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        throw new Error(`Review channel not found: ${channelId}`);
    }

    // 2. Build Review Embed
    // We import here to avoid circular dependencies if any
    const { buildSubmissionEmbed } = require('./embedBuilder');
    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${user.tag} (${user.id})`,
            iconURL: user.displayAvatarURL()
        })
        .setTitle(`New Submission: ${type.toUpperCase()}`)
        .setColor('#FFA500') // Orange for pending
        .setTimestamp()
        .setFooter({ text: 'Status: Pending Review' });

    // Add fields
    for (const [key, value] of Object.entries(submissionData)) {
        embed.addFields({
            name: key,
            value: value.length > 1024 ? value.substring(0, 1021) + '...' : (value || '[Empty]'),
            inline: false
        });
    }

    // 3. Determine Ping (formatted string)
    let content = '';
    const roleId = announcementConfig.roles[`reviewer_${type}`];
    if (roleId && !roleId.includes('REPLACE')) {
        content = `<@&${roleId}>`;
    }

    // 4. Send to Channel
    return await channel.send({
        content: content || null,
        embeds: [embed]
    });
}

module.exports = {
    routeSubmission
};
