const aiClient = require('./aiClient');
const smartConfig = require('./smartConfig');
const memoryService = require('./memoryService');
const contentFilter = require('../utils/contentFilter');
const stickyService = require('./stickyService');

/**
 * Smart service for AI-powered responses
 */
class SmartService {
    /**
     * Build context pack from channel
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {number} limit 
     * @param {string} userMessage 
     * @returns {Promise<Object>}
     */
    async buildContextPack(channel, limit = 25, userMessage = null) {
        const context = {
            messages: [],
            stickyNote: null,
            memory: null,
            userMessage
        };

        try {
            // Fetch recent messages
            const fetched = await channel.messages.fetch({ limit });
            context.messages = Array.from(fetched.values())
                .reverse()
                .map(msg => ({
                    author: msg.author.username,
                    content: msg.content,
                    timestamp: msg.createdAt.toISOString(),
                    isBot: msg.author.bot
                }));

            // Get sticky note if exists
            const stickyNote = stickyService.getStickyNote(channel.id);
            if (stickyNote) {
                context.stickyNote = stickyNote.content;
            }

            // Get memory if enabled
            if (smartConfig.get('memory') === 'summaries') {
                const memory = memoryService.getMemory(channel.id);
                if (memory) {
                    context.memory = memory;
                }
            }
        } catch (error) {
            console.error('[Smart Service] Error building context:', error);
        }

        return context;
    }

    /**
     * Build AI prompt messages
     * @param {Object} contextPack 
     * @param {string} mode 
     * @returns {Array}
     */
    buildPrompt(contextPack, mode = 'reply') {
        const messages = [];

        // System prompt from Persona
        let systemPrompt = smartConfig.getPersonaSystemPrompt();

        systemPrompt += `\n
RULES:
- Be concise and helpful
- Do not impersonate users
- Do not dump raw logs or technical data
- Refuse requests for harassment, sexual content involving minors, doxxing, or illegal activities
- Stay on topic and relevant to the conversation
- Maximum response length: 1200 characters`;

        if (mode === 'suggest') {
            systemPrompt += '\n- Provide exactly 3 short reply suggestions as a bulleted list';
        } else if (mode === 'summarize') {
            systemPrompt += '\n- Provide a brief summary of the conversation';
        } else if (mode === 'actionable') {
            systemPrompt += '\n- Provide one reply followed by 3 suggested next actions';
        }

        messages.push({
            role: 'system',
            content: systemPrompt
        });

        // Add context
        let contextContent = '';

        if (contextPack.memory) {
            contextContent += `--- LONG TERM MEMORY ---\n`;
            contextContent += `Topic: ${contextPack.memory.topic}\n`;
            contextContent += `Status: ${contextPack.memory.status}\n`;
            if (contextPack.memory.summary) {
                contextContent += `Summary: ${contextPack.memory.summary}\n`;
            }
            if (contextPack.memory.keyPoints?.length > 0) {
                contextContent += `Key Points: ${contextPack.memory.keyPoints.join('; ')}\n`;
            }
            if (contextPack.memory.openQuestions?.length > 0) {
                contextContent += `Open Questions: ${contextPack.memory.openQuestions.join('; ')}\n`;
            }
            contextContent += `--- END MEMORY ---\n\n`;
        }

        if (contextPack.stickyNote) {
            contextContent += `Sticky Note: ${contextPack.stickyNote}\n\n`;
        }

        if (contextPack.messages.length > 0) {
            contextContent += 'Recent Messages:\n';
            for (const msg of contextPack.messages.slice(-15)) {
                contextContent += `${msg.author}: ${msg.content}\n`;
            }
        }

        if (contextContent) {
            messages.push({
                role: 'user',
                content: contextContent
            });
        }

        // Add user message if provided
        if (contextPack.userMessage) {
            messages.push({
                role: 'user',
                content: contextPack.userMessage
            });
        } else if (mode === 'reply') {
            messages.push({
                role: 'user',
                content: 'Based on the context above, provide a helpful response.'
            });
        } else if (mode === 'suggest') {
            messages.push({
                role: 'user',
                content: 'Provide 3 short reply suggestions based on the conversation.'
            });
        } else if (mode === 'summarize') {
            messages.push({
                role: 'user',
                content: 'Summarize the recent conversation briefly.'
            });
        } else if (mode === 'actionable') {
            messages.push({
                role: 'user',
                content: 'Provide a helpful reply and suggest 3 next actions.'
            });
        }

        return messages;
    }

    /**
     * Generate AI response
     * @param {import('discord.js').TextBasedChannel} channel 
     * @param {Object} options 
     * @returns {Promise<string>}
     */
    async generateResponse(channel, options = {}) {
        const {
            mode = 'reply',
            depth = 'standard',
            userMessage = null,
            contextLimit = smartConfig.get('context_limit')
        } = options;

        // Check if AI client is ready
        if (!aiClient.isReady()) {
            throw new Error('AI service is not configured. Please add OPENAI_API_KEY to environment.');
        }

        // Check for unsafe content in user message
        if (userMessage && contentFilter.isUnsafe(userMessage)) {
            return contentFilter.getRefusalMessage();
        }

        // Build context pack
        const contextPack = await this.buildContextPack(channel, contextLimit, userMessage);

        // Build prompt
        const messages = this.buildPrompt(contextPack, mode);

        // Determine max tokens based on depth
        const maxTokens = {
            light: 200,
            standard: 400,
            deep: 600
        }[depth] || 400;

        // Generate response
        const response = await aiClient.generateChatResponse(messages, { maxTokens });

        // Validate and sanitize
        const validated = contentFilter.validate(response, userMessage);

        return validated.content;
    }

    /**
     * Check if message should trigger auto response
     * @param {import('discord.js').Message} message 
     * @param {import('discord.js').Client} client 
     * @returns {boolean}
     */
    shouldTriggerAuto(message, client) {
        const triggers = smartConfig.get('triggers');

        // Check mention
        if (triggers.mention && message.mentions.has(client.user.id)) {
            return true;
        }

        // Check reply to bot
        if (triggers.reply_to_bot && message.reference) {
            // Would need to fetch referenced message to check if it's from bot
            return true;
        }

        // Check prefix
        if (triggers.prefix && triggers.prefix !== 'off') {
            if (message.content.toLowerCase().startsWith(triggers.prefix.toLowerCase())) {
                return true;
            }
        }

        // Check keywords
        if (triggers.keywords && triggers.keywords !== 'off') {
            const keywords = triggers.keywords.split(',').map(k => k.trim().toLowerCase());
            const content = message.content.toLowerCase();
            for (const keyword of keywords) {
                if (content.includes(keyword)) {
                    return true;
                }
            }
        }

        return false;
    }
}

module.exports = new SmartService();
