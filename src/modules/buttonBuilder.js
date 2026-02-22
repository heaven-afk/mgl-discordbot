const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Builds action rows containing buttons based on configuration
 * @param {Array} buttonConfigs - Array of button configuration objects
 * @returns {Array<ActionRowBuilder>} Array of action rows
 */
function buildActionRows(buttonConfigs) {
    if (!buttonConfigs || buttonConfigs.length === 0) {
        return [];
    }

    const row = new ActionRowBuilder();

    buttonConfigs.forEach(config => {
        const button = new ButtonBuilder();

        // Common properties
        if (config.label) button.setLabel(config.label);
        if (config.emoji) button.setEmoji(config.emoji);
        if (config.disabled) button.setDisabled(config.disabled);

        // Type specific properties
        if (config.type === 'link') {
            button.setStyle(ButtonStyle.Link);
            button.setURL(config.url);
        } else {
            // Interaction button
            button.setCustomId(config.customId);

            // Map style string to enum
            switch (config.style?.toLowerCase()) {
                case 'primary':
                    button.setStyle(ButtonStyle.Primary);
                    break;
                case 'secondary':
                    button.setStyle(ButtonStyle.Secondary);
                    break;
                case 'success':
                    button.setStyle(ButtonStyle.Success);
                    break;
                case 'danger':
                    button.setStyle(ButtonStyle.Danger);
                    break;
                default:
                    button.setStyle(ButtonStyle.Primary);
            }
        }

        row.addComponents(button);
    });

    // Return as array (Discord expects an array of rows, even if just one)
    return [row];
}

module.exports = {
    buildActionRows
};
