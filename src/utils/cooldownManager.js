/**
 * Cooldown manager for rate limiting
 */
class CooldownManager {
    constructor() {
        this.userCooldowns = new Map();
        this.channelCooldowns = new Map();
        this.autoUserCooldowns = new Map();
    }

    /**
     * Check if user is on cooldown
     */
    isUserOnCooldown(userId, cooldownSeconds) {
        const now = Date.now();
        const lastUse = this.userCooldowns.get(userId);

        if (!lastUse) return false;

        const elapsed = (now - lastUse) / 1000;
        return elapsed < cooldownSeconds;
    }

    /**
     * Check if channel is on cooldown
     */
    isChannelOnCooldown(channelId, cooldownSeconds) {
        const now = Date.now();
        const lastUse = this.channelCooldowns.get(channelId);

        if (!lastUse) return false;

        const elapsed = (now - lastUse) / 1000;
        return elapsed < cooldownSeconds;
    }

    /**
     * Check if user is on auto cooldown
     */
    isAutoUserOnCooldown(userId, cooldownSeconds) {
        const now = Date.now();
        const lastUse = this.autoUserCooldowns.get(userId);

        if (!lastUse) return false;

        const elapsed = (now - lastUse) / 1000;
        return elapsed < cooldownSeconds;
    }

    /**
     * Set user cooldown
     */
    setUserCooldown(userId) {
        this.userCooldowns.set(userId, Date.now());
    }

    /**
     * Set channel cooldown
     */
    setChannelCooldown(channelId) {
        this.channelCooldowns.set(channelId, Date.now());
    }

    /**
     * Set auto user cooldown
     */
    setAutoUserCooldown(userId) {
        this.autoUserCooldowns.set(userId, Date.now());
    }

    /**
     * Get remaining cooldown time
     */
    getRemainingCooldown(userId, cooldownSeconds, isAuto = false) {
        const now = Date.now();
        const map = isAuto ? this.autoUserCooldowns : this.userCooldowns;
        const lastUse = map.get(userId);

        if (!lastUse) return 0;

        const elapsed = (now - lastUse) / 1000;
        const remaining = Math.max(0, cooldownSeconds - elapsed);
        return Math.ceil(remaining);
    }

    /**
     * Clean up old cooldowns (run periodically)
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [userId, timestamp] of this.userCooldowns.entries()) {
            if (now - timestamp > maxAge) {
                this.userCooldowns.delete(userId);
            }
        }

        for (const [channelId, timestamp] of this.channelCooldowns.entries()) {
            if (now - timestamp > maxAge) {
                this.channelCooldowns.delete(channelId);
            }
        }

        for (const [userId, timestamp] of this.autoUserCooldowns.entries()) {
            if (now - timestamp > maxAge) {
                this.autoUserCooldowns.delete(userId);
            }
        }
    }
}

module.exports = new CooldownManager();
