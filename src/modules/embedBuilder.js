const { EmbedBuilder } = require('discord.js');

/**
 * Builds an announcement embed based on the configuration type
 * @param {Object} config - The announcement configuration object
 * @param {Object} overrides - Optional overrides for the embed (e.g., banner)
 * @returns {EmbedBuilder} The constructed embed
 */
function buildAnnouncementEmbed(config, overrides = {}) {
    const embedConfig = config.embed;

    // Create new EmbedBuilder
    const embed = new EmbedBuilder()
        .setColor(embedConfig.color || '#5865F2')
        .setTimestamp();

    // Set Title
    if (embedConfig.title) {
        embed.setTitle(embedConfig.title);
    }

    // Set Description
    if (embedConfig.description) {
        embed.setDescription(embedConfig.description);
    }

    // Add Fields (Sections)
    if (embedConfig.sections && Array.isArray(embedConfig.sections)) {
        embedConfig.sections.forEach(section => {
            embed.addFields({
                name: section.name,
                value: section.value,
                inline: section.inline || false
            });
        });
    }

    // Set Footer
    if (embedConfig.footer) {
        embed.setFooter({ text: embedConfig.footer });
    }

    // Set Image/Banner (Priority: Override > Config > null)
    const bannerUrl = overrides.banner || embedConfig.banner;
    if (bannerUrl) {
        embed.setImage(bannerUrl);
    }

    // Set Thumbnail if provided
    if (embedConfig.thumbnail) {
        embed.setThumbnail(embedConfig.thumbnail);
    }

    return embed;
}

/**
 * Builds a submission review embed for staff channels
 * @param {Object} submissionData - The data submitted by the user
 * @param {User} user - The Discord user who submitted
 * @param {String} type - The type of submission (recruitment, report, etc.)
 * @returns {EmbedBuilder} The constructed review embed
 */
function buildSubmissionEmbed(submissionData, user, type) {
    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${user.tag} (${user.id})`,
            iconURL: user.displayAvatarURL()
        })
        .setTitle(`New Submission: ${type.toUpperCase()}`)
        .setColor('#FFA500') // Orange for pending
        .setTimestamp()
        .setFooter({ text: 'Status: Pending Review' });

    // Add fields from submission
    for (const [key, value] of Object.entries(submissionData)) {
        // Truncate value if it exceeds Discord's limit (1024 chars)
        const truncatedValue = value.length > 1024 ? value.substring(0, 1021) + '...' : value;

        embed.addFields({
            name: key, // The label or ID of the field
            value: truncatedValue || '[Empty]',
            inline: false
        });
    }

    return embed;
}

module.exports = {
    buildAnnouncementEmbed,
    buildSubmissionEmbed
};
