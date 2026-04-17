const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenAI } = require('@google/genai');
const config = require('../config/ai-api-config');

/**
 * AI Client - Supports Gemini, Claude, and OpenAI
 */
class AIClient {
    constructor() {
        this.client = null;
        this.provider = config.provider.toLowerCase();
        this.initialized = false;
    }

    /**
     * Initialize the AI client based on active provider
     */
    init() {
        if (this.initialized) return;

        console.log(`[AI Client] Starting initialization for provider: ${this.provider}`);

        if (this.provider === 'gemini') {
            if (!config.gemini.apiKey) {
                throw new Error("GEMINI_API_KEY is not set. Please add it to your .env file or change AI_PROVIDER");
            }
            this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
            console.log('[AI Client] Successfully initialized Google Gemini');
        } else if (this.provider === 'claude') {
            if (!config.anthropic.apiKey) {
                throw new Error("ANTHROPIC_API_KEY is not set. Please add it to your .env file or change AI_PROVIDER");
            }
            this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
            console.log('[AI Client] Successfully initialized Anthropic Claude');
        } else if (this.provider === 'openai') {
            if (!config.openai.apiKey) {
                throw new Error("OPENAI_API_KEY is not set. Please add it to your .env file or change AI_PROVIDER");
            }
            this.client = new OpenAI({ 
                apiKey: config.openai.apiKey,
                baseURL: config.openai.baseUrl
            });
            console.log('[AI Client] Successfully initialized OpenAI');
        } else {
             console.log(`[AI Client] Invalid provider '${this.provider}'. Falling back to Gemini...`);
             this.provider = 'gemini';
             if (!config.gemini.apiKey) throw new Error("Fallback failed. GEMINI_API_KEY is missing.");
             this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
        }
        
        this.initialized = true;
    }

    /**
     * Normalizes message history so roles alternate (required for some APIs)
     */
    _normalizeMessages(messages) {
        const normalized = [];
        for (const m of messages.filter(msg => msg.role !== 'system')) {
            const role = (m.role === 'assistant' || m.role === 'model') ? 'assistant' : 'user';
            
            if (normalized.length > 0 && normalized[normalized.length - 1].role === role) {
                normalized[normalized.length - 1].content += `\n\n${m.content}`;
            } else {
                normalized.push({ role, content: m.content });
            }
        }
        return normalized;
    }

    /**
     * Generate chat response
     * @param {Array} messages - Array of message objects {role, content}
     * @param {Object} options - Additional options
     * @returns {Promise<string>}
     */
    async generateChatResponse(messages, options = {}) {
        if (!this.initialized) {
            throw new Error('AI Client not initialized.');
        }

        const { maxTokens = config.defaults.maxTokens, temperature = config.defaults.temperature } = options;

        try {
            if (this.provider === 'gemini') {
                return await this.queryGemini(messages, maxTokens, temperature);
            } else if (this.provider === 'claude') {
                return await this.queryAnthropic(messages, maxTokens, temperature);
            } else if (this.provider === 'openai') {
                return await this.queryOpenAI(messages, maxTokens, temperature);
            }
        } catch (error) {
            console.error(`[AI Client] Error calling ${this.provider}:`, error.message);
            throw new Error(`AI Request failed using ${this.provider}: ${error.message}`);
        }
    }

    /**
     * Query Google Gemini
     */
    async queryGemini(messages, maxTokens, temperature) {
        const systemMessage = messages.find(m => m.role === 'system');
        const normalized = this._normalizeMessages(messages);
        
        // Gemini roles: 'user' or 'model'
        const geminiMessages = normalized.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
            
        const aiParams = {
            model: config.gemini.model,
            contents: geminiMessages,
            config: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            }
        };
        
        if (systemMessage) {
             aiParams.config.systemInstruction = {
                role: 'system',
                parts: [{ text: systemMessage.content }]
             };
        }

        const response = await this.client.models.generateContent(aiParams);
        return response.text || '';
    }

    /**
     * Query Anthropic Claude
     */
    async queryAnthropic(messages, maxTokens, temperature) {
        const systemMessage = messages.find(m => m.role === 'system');
        const claudeMessages = this._normalizeMessages(messages);

        const params = {
            model: config.anthropic.model,
            max_tokens: maxTokens,
            temperature: temperature,
            messages: claudeMessages
        };
        
        if (systemMessage) {
            params.system = systemMessage.content;
        }

        const response = await this.client.messages.create(params);
        return response.content[0]?.text || '';
    }

    /**
     * Query OpenAI
     */
    async queryOpenAI(messages, maxTokens, temperature) {
        const response = await this.client.chat.completions.create({
            model: config.openai.model,
            messages,
            max_tokens: maxTokens,
            temperature,
            presence_penalty: 0.1,
            frequency_penalty: 0.1
        });

        return response.choices[0]?.message?.content || '';
    }

    /**
     * Check if client is ready
     */
    isReady() {
        return this.initialized;
    }
}

module.exports = new AIClient();
