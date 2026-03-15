const { InteractionType } = require('discord.js');
const announcementTypes = require('../config/announcementTypes.json');
const announcementConfig = require('../config/announcementConfig.json');
const { buildModal } = require('../modules/modalBuilder');
const permissionGuard = require('../modules/permissionGuard');
const cooldownManager = require('../utils/cooldownManager');

/**
 * Handles button interactions
 * @param {ButtonInteraction} interaction 
 */
async function handle(interaction) {
    const customId = interaction.customId;

    // 1. Identify Button Type
    // We look through our config to find which button this is
    let foundType = null;
    let foundConfig = null;

    for (const [type, config] of Object.entries(announcementTypes)) {
        if (!config.buttons) continue;
        const buttonConfig = config.buttons.find(b => b.customId === customId);
        if (buttonConfig) {
            foundType = type;
            foundConfig = config;
            break;
        }
    }

    if (!foundType) {
        // Not one of our announcement buttons, might belong to another system
        return;
    }

    // 2. Check System Enabled
    if (!announcementConfig.enabled) {
        return interaction.reply({
            content: '⚠️ The announcement system is currently disabled.',
            ephemeral: true
        });
    }

    // 3. Permission/Role Check
    const permCheck = permissionGuard.canSubmitModal(interaction.member, foundType);
    if (!permCheck.allowed) {
        return interaction.reply({
            content: `⛔ Permission Denied: ${permCheck.reason || 'You cannot use this button.'}`,
            ephemeral: true
        });
    }

    // 4. Cooldown Check
    // We use a custom cooldown key for button clicks to prevent spamming modals
    const cooldownKey = `btn_${foundType}_${interaction.user.id}`;
    if (cooldownManager.checkCooldown(cooldownKey)) {
        const remaining = cooldownManager.getRemainingTime(cooldownKey);
        return interaction.reply({
            content: `⏳ Please wait ${remaining.toFixed(1)}s before acting again.`,
            ephemeral: true
        });
    }
    // Set small cooldown for button clicks (e.g. 3s)
    cooldownManager.setCooldown(cooldownKey, announcementConfig.cooldowns?.button_click || 3);

    // 5. Action: Show Modal
    // If the config has a modal associated with this type, show it
    if (foundConfig.modal) {
        const modal = buildModal(foundConfig.modal);
        if (modal) {
            await interaction.showModal(modal);
        } else {
            await interaction.reply({
                content: '❌ Error: Modal configuration missing.',
                ephemeral: true
            });
        }
    } else {
        // It might be a button that does something else (future expansion)
        await interaction.reply({
            content: '✅ Interaction received.',
            ephemeral: true
        });
    }
}

module.exports = {
    handle
};
