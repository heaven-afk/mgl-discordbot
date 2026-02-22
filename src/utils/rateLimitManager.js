const fs = require('fs');
const path = require('path');

const RATE_LIMIT_PATH = path.join(__dirname, '../storage/rateLimits.json');

/**
 * Rate limit tracker for AI providers
 * Prevents exceeding free tier quotas
 */
class RateLimitManager {
    constructor() {
        this.limits = this.load();
        this.enabled = process.env.RATE_LIMIT_ENABLED !== 'false';

        // Reset counters at the top of each hour
        setInterval(() => this.resetHourly(), 60 * 60 * 1000);

        // Reset daily counters at midnight
        this.scheduleDailyReset();
    }

    /**
     * Load rate limits from storage
     */
    load() {
        try {
            if (fs.existsSync(RATE_LIMIT_PATH)) {
                const data = fs.readFileSync(RATE_LIMIT_PATH, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('[Rate Limit] Error loading rate limits:', error);
        }

        return this.getDefaultLimits();
    }

    /**
     * Get default limit structure
     */
    getDefaultLimits() {
        return {
            openrouter: { hourly: 0, daily: 0, lastHourReset: Date.now(), lastDayReset: Date.now() },
            huggingface: { hourly: 0, daily: 0, lastHourReset: Date.now(), lastDayReset: Date.now() },
            ollama: { hourly: 0, daily: 0, lastHourReset: Date.now(), lastDayReset: Date.now() },
            togetherai: { hourly: 0, daily: 0, lastHourReset: Date.now(), lastDayReset: Date.now() },
            siliconflow: { hourly: 0, daily: 0, lastHourReset: Date.now(), lastDayReset: Date.now() }
        };
    }

    /**
     * Save rate limits to storage
     */
    save() {
        try {
            const dir = path.dirname(RATE_LIMIT_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(RATE_LIMIT_PATH, JSON.stringify(this.limits, null, 2));
        } catch (error) {
            console.error('[Rate Limit] Error saving rate limits:', error);
        }
    }

    /**
     * Check if provider can accept requests
     * @param {string} provider - Provider name
     * @param {Object} maxLimits - Max limits from config {hourly, daily}
     * @returns {Object} {allowed: boolean, reason: string}
     */
    canMakeRequest(provider, maxLimits) {
        if (!this.enabled) {
            return { allowed: true };
        }

        if (!this.limits[provider]) {
            this.limits[provider] = {
                hourly: 0,
                daily: 0,
                lastHourReset: Date.now(),
                lastDayReset: Date.now()
            };
        }

        const current = this.limits[provider];

        // Check hourly limit
        if (current.hourly >= maxLimits.hourly) {
            return {
                allowed: false,
                reason: `Hourly limit reached (${maxLimits.hourly} requests/hour)`,
                resetIn: this.getTimeUntilReset('hourly', current.lastHourReset)
            };
        }

        // Check daily limit
        if (current.daily >= maxLimits.daily) {
            return {
                allowed: false,
                reason: `Daily limit reached (${maxLimits.daily} requests/day)`,
                resetIn: this.getTimeUntilReset('daily', current.lastDayReset)
            };
        }

        return { allowed: true };
    }

    /**
     * Record a request for a provider
     * @param {string} provider - Provider name
     */
    recordRequest(provider) {
        if (!this.enabled) return;

        if (!this.limits[provider]) {
            this.limits[provider] = {
                hourly: 0,
                daily: 0,
                lastHourReset: Date.now(),
                lastDayReset: Date.now()
            };
        }

        this.limits[provider].hourly++;
        this.limits[provider].daily++;
        this.save();
    }

    /**
     * Get usage statistics for a provider
     * @param {string} provider - Provider name
     * @param {Object} maxLimits - Max limits from config
     * @returns {Object} Usage stats
     */
    getUsage(provider, maxLimits) {
        const current = this.limits[provider] || { hourly: 0, daily: 0 };

        return {
            hourly: {
                used: current.hourly,
                max: maxLimits.hourly,
                percentage: Math.round((current.hourly / maxLimits.hourly) * 100),
                remaining: maxLimits.hourly - current.hourly
            },
            daily: {
                used: current.daily,
                max: maxLimits.daily,
                percentage: Math.round((current.daily / maxLimits.daily) * 100),
                remaining: maxLimits.daily - current.daily
            }
        };
    }

    /**
     * Reset hourly counters
     */
    resetHourly() {
        for (const provider in this.limits) {
            this.limits[provider].hourly = 0;
            this.limits[provider].lastHourReset = Date.now();
        }
        this.save();
        console.log('[Rate Limit] Hourly counters reset');
    }

    /**
     * Reset daily counters
     */
    resetDaily() {
        for (const provider in this.limits) {
            this.limits[provider].daily = 0;
            this.limits[provider].lastDayReset = Date.now();
        }
        this.save();
        console.log('[Rate Limit] Daily counters reset');
    }

    /**
     * Schedule daily reset at midnight
     */
    scheduleDailyReset() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = midnight - now;

        setTimeout(() => {
            this.resetDaily();
            // Schedule next reset
            setInterval(() => this.resetDaily(), 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
    }

    /**
     * Get time until reset in human-readable format
     * @param {string} type - 'hourly' or 'daily'
     * @param {number} lastReset - Timestamp of last reset
     * @returns {string} Time until reset
     */
    getTimeUntilReset(type, lastReset) {
        const now = Date.now();
        const resetInterval = type === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        const nextReset = lastReset + resetInterval;
        const msRemaining = nextReset - now;

        if (msRemaining <= 0) return 'Soon';

        const minutes = Math.floor(msRemaining / (60 * 1000));
        const hours = Math.floor(minutes / 60);

        if (type === 'hourly') {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Get all provider statistics
     * @param {Object} configs - Provider configs with rate limits
     * @returns {Object} All stats
     */
    getAllUsage(configs) {
        const stats = {};
        for (const provider in configs) {
            if (configs[provider].rateLimits) {
                stats[provider] = this.getUsage(provider, configs[provider].rateLimits);
            }
        }
        return stats;
    }

    /**
     * Reset usage for a specific provider (admin use)
     * @param {string} provider - Provider name
     */
    resetProvider(provider) {
        if (this.limits[provider]) {
            this.limits[provider].hourly = 0;
            this.limits[provider].daily = 0;
            this.save();
            console.log(`[Rate Limit] Reset counters for ${provider}`);
        }
    }
}

module.exports = new RateLimitManager();
