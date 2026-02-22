/**
 * Content filter and output sanitizer
 */
class ContentFilter {
    constructor() {
        this.maxLength = 1200;
        this.unsafePatterns = [
            /how to (hack|crack|break into|exploit)/i,
            /create (malware|virus|ransomware)/i,
            /(sexual|nude|nsfw).*(child|minor|kid|teen)/i,
            /doxx(ing)?|personal (address|phone|ssn)/i,
            /(kill|harm|hurt).*(yourself|myself)/i
        ];
    }

    /**
     * Sanitize output text
     * @param {string} text 
     * @returns {string}
     */
    sanitize(text) {
        if (!text) return '';

        // Truncate to max length
        let sanitized = text.substring(0, this.maxLength);

        // Remove @everyone and @here
        sanitized = sanitized.replace(/@(everyone|here)/gi, '@ $1');

        // Remove role mentions <@&roleId>
        sanitized = sanitized.replace(/<@&\d+>/g, '@role');

        // Clean up user mentions to be safer
        sanitized = sanitized.replace(/<@!?(\d+)>/g, '@user');

        return sanitized.trim();
    }

    /**
     * Check if content contains unsafe patterns
     * @param {string} text 
     * @returns {boolean}
     */
    isUnsafe(text) {
        if (!text) return false;

        const lowerText = text.toLowerCase();

        for (const pattern of this.unsafePatterns) {
            if (pattern.test(lowerText)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get refusal message
     * @returns {string}
     */
    getRefusalMessage() {
        return "I can't help with that request. Please ask something else that's helpful and appropriate.";
    }

    /**
     * Validate and sanitize AI response
     * @param {string} response 
     * @param {string} userPrompt 
     * @returns {Object} {safe: boolean, content: string}
     */
    validate(response, userPrompt = '') {
        // Check if user prompt is unsafe
        if (this.isUnsafe(userPrompt)) {
            return {
                safe: false,
                content: this.getRefusalMessage()
            };
        }

        // Check if AI response is unsafe
        if (this.isUnsafe(response)) {
            return {
                safe: false,
                content: this.getRefusalMessage()
            };
        }

        // Sanitize the response
        const sanitized = this.sanitize(response);

        return {
            safe: true,
            content: sanitized
        };
    }
}

module.exports = new ContentFilter();
