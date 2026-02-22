const announcementTypes = require('../config/announcementTypes.json');
const router = require('../modules/router');
const cooldownManager = require('../utils/cooldownManager');
const announcementConfig = require('../config/announcementConfig.json');

/**
 * Handles modal submissions
 * @param {ModalSubmitInteraction} interaction 
 */
async function handle(interaction) {
    const customId = interaction.customId;

    // 1. Identify Modal Type
    let foundType = null;
    let foundConfig = null;

    for (const [type, config] of Object.entries(announcementTypes)) {
        if (config.modal && config.modal.customId === customId) {
            foundType = type;
            foundConfig = config;
            break;
        }
    }

    if (!foundType) {
        return; // Not our modal
    }

    // 2. Extract Data
    const submissionData = {};
    const fields = foundConfig.modal.fields;

    for (const field of fields) {
        try {
            const value = interaction.fields.getTextInputValue(field.customId);
            submissionData[field.label] = value;
        } catch (err) {
            console.error(`Missing field ${field.customId} in submission`);
        }
    }

    // 3. Process Submission
    try {
        await interaction.deferReply({ ephemeral: true });

        // Route to review channel
        await router.routeSubmission(
            interaction.client,
            foundType,
            submissionData,
            interaction.user,
            interaction.guild
        );

        // Set long cooldown for submissions
        const cooldownKey = `modal_submit_${foundType}_${interaction.user.id}`;
        cooldownManager.setCooldown(
            cooldownKey,
            announcementConfig.cooldowns?.modal_submit || 60
        );

        // 4. Confirm to User
        await interaction.editReply({
            content: `✅ **Submission Received!**\nYour ${foundType} submission has been sent to our team for review. You will be contacted if necessary.`
        });

    } catch (error) {
        console.error('Submission processing error:', error);

        let errorMessage = '❌ An error occurred while processing your submission.';
        if (error.message.includes('Review channel not found')) {
            errorMessage += '\n(System Error: Review channel not configured)';
        }

        await interaction.editReply({
            content: errorMessage
        });
    }
}

module.exports = {
    handle
};
