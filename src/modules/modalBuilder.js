const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

/**
 * Builds a modal based on configuration
 * @param {Object} modalConfig - The modal configuration object
 * @returns {ModalBuilder} The constructed modal
 */
function buildModal(modalConfig) {
    if (!modalConfig) return null;

    const modal = new ModalBuilder()
        .setCustomId(modalConfig.customId)
        .setTitle(modalConfig.title);

    // Add inputs
    if (modalConfig.fields && Array.isArray(modalConfig.fields)) {
        modalConfig.fields.forEach(field => {
            const input = new TextInputBuilder()
                .setCustomId(field.customId)
                .setLabel(field.label)
                .setPlaceholder(field.placeholder || '')
                .setRequired(field.required !== false) // Default to true
                .setMaxLength(field.maxLength || 4000);

            // Set style
            if (field.style === 'Paragraph') {
                input.setStyle(TextInputStyle.Paragraph);
            } else {
                input.setStyle(TextInputStyle.Short);
            }

            // Text inputs must be in their own rows
            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);
        });
    }

    return modal;
}

module.exports = {
    buildModal
};
