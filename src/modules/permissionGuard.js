const { PermissionFlagsBits } = require('discord.js');
const announcementConfig = require('../config/announcementConfig.json');
const permissionService = require('../services/permissionService');

/**
 * Checks if a member can use a specific command based on tiers
 * @param {GuildMember} member 
 * @param {string} commandName 
 * @returns {boolean}
 */
function isAllowed(member, commandName) {
    return permissionService.isAllowed(member, commandName);
}

/**
 * Checks if a user has permission to post announcements
 */
function canPostAnnouncement(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

    if (announcementConfig.roles && announcementConfig.roles.admin) {
        if (member.roles.cache.has(announcementConfig.roles.admin)) return true;
    }

    return false;
}

/**
 * Checks if a user can submit a specific modal type
 */
function canSubmitModal(member, type) {
    if (!announcementConfig.enabled) {
        return { allowed: false, reason: 'The announcement system is currently disabled.' };
    }
    return { allowed: true };
}


module.exports = {
    isAllowed,
    canPostAnnouncement,
    canSubmitModal
};
