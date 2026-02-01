const { PermissionsBitField } = require('discord.js');

/**
 * Checks if the member has the required permissions.
 * @param {import('discord.js').GuildMember} member
 * @param {bigint} permission
 * @returns {boolean}
 */
const hasPermission = (member, permission) => {
    return member.permissions.has(permission);
};

/**
 * Checks if the bot has required permissions in a channel.
 * @param {import('discord.js').GuildChannel} channel
 * @param {bigint[]} permissions
 * @returns {boolean}
 */
const botHasChannelPermissions = (channel, permissions) => {
    const botMember = channel.guild.members.me;
    if (!botMember) return false;
    return channel.permissionsFor(botMember).has(permissions);
};

module.exports = {
    hasPermission,
    botHasChannelPermissions,
    Permissions: PermissionsBitField.Flags
};
