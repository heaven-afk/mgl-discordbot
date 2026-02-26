const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

class PermissionService {
    constructor() {
        this.configPath = path.join(__dirname, '../config/permissions.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
        } catch (error) {
            console.error('[PermissionService] Error loading config:', error);
        }
        return {
            roles: { tier1: [], tier2: [], tier3: [] },
            users: { tier1: [], tier2: [], tier3: [] },
            commandTiers: {}
        };
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
        } catch (error) {
            console.error('[PermissionService] Error saving config:', error);
        }
    }

    /**
     * Get the tier of a command
     * @param {string} commandName 
     * @returns {number} Tier (1, 2, 3 or 0 if no restriction)
     */
    getCommandTier(commandName) {
        return this.config.commandTiers[commandName] || 0;
    }

    /**
     * Get the highest tier a member has access to
     * @param {GuildMember} member 
     * @returns {number} Tier (1 to 3, or 0)
     */
    getMemberTier(member) {
        // Admins automatically get Tier 3
        if (member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return 3;
        }

        let highestTier = 0;

        // Check user ID matches
        for (let tier = 3; tier >= 1; tier--) {
            if (this.config.users[`tier${tier}`].includes(member.id)) {
                highestTier = Math.max(highestTier, tier);
                break; // Found highest user tier
            }
        }

        // Check role matches (if user tier isn't already 3)
        if (highestTier < 3) {
            for (let tier = 3; tier >= 1; tier--) {
                const tierRoles = this.config.roles[`tier${tier}`];
                if (member.roles.cache.some(role => tierRoles.includes(role.id))) {
                    highestTier = Math.max(highestTier, tier);
                    break; // Found highest role tier
                }
            }
        }

        // Default: If no tier is assigned, everyone has Tier 1 access for consistency
        return highestTier || 1;
    }

    /**
     * Check if a member can use a specific command
     * @param {GuildMember} member 
     * @param {string} commandName 
     * @returns {boolean}
     */
    isAllowed(member, commandName) {
        const commandTier = this.getCommandTier(commandName);
        if (commandTier === 0) return true; // No restriction

        const memberTier = this.getMemberTier(member);
        return memberTier >= commandTier;
    }

    /**
     * Update access for a role or user
     * @param {'roles'|'users'} type 
     * @param {string} id 
     * @param {number} tier 
     * @param {boolean} action (true to add, false to remove)
     */
    updateAccess(type, id, tier, action) {
        const key = `tier${tier}`;
        if (!this.config[type][key]) return false;

        if (action) {
            if (!this.config[type][key].includes(id)) {
                this.config[type][key].push(id);
            }
        } else {
            this.config[type][key] = this.config[type][key].filter(item => item !== id);
        }

        this.saveConfig();
        return true;
    }

    getAll() {
        return this.config;
    }
}

module.exports = new PermissionService();
