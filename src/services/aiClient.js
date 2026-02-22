const OpenAI = require('openai');
const axios = require('axios');
const config = require('../config/ai-api-config');

/**
 * Simple AI Client - Uses Ollama (local, free) with optional OpenAI fallback
 */
class AIClient {
    constructor() {
        this.openaiClient = null;
        this.initialized = false;
    }

    /**
     * Initialize the AI client
     */
    init() {
        if (this.initialized) return;

        // Check if OpenAI is configured
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey && apiKey !== 'your_openai_api_key_here') {
            const openaiConfig = { apiKey };
            if (config.openai.baseUrl) {
                openaiConfig.baseURL = config.openai.baseUrl;
            }
            this.openaiClient = new OpenAI(openaiConfig);
            console.log('[AI Client] OpenAI configured as fallback');
        }

        this.initialized = true;
        console.log('[AI Client] Initialized with Ollama (primary)');
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

        const { maxTokens = 500, temperature = 0.7 } = options;

        // Try Ollama first
        try {
            return await this.queryOllama(messages, maxTokens, temperature);
        } catch (error) {
            console.error('[AI Client] Ollama error:', error.message);

            // Fall back to OpenAI if available
            if (this.openaiClient) {
                console.log('[AI Client] Falling back to OpenAI...');
                return await this.queryOpenAI(messages, maxTokens, temperature);
            }

            throw new Error('AI service unavailable. Make sure Ollama is running (ollama serve)');
        }
    }

    /**
     * Query Ollama
     */
    async queryOllama(messages, maxTokens, temperature) {
        // Convert messages to prompt
        const prompt = messages
            .filter(m => m.role !== 'system')
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n');

        try {
            const response = await axios.post(
                `${config.ollama.baseUrl}/api/generate`,
                {
                    model: config.ollama.defaultModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: temperature,
                        num_predict: maxTokens
                    }
                },
                { timeout: config.ollama.timeout }
            );

            console.log('[AI Client] Ollama response:', JSON.stringify(response.data).substring(0, 200));

            const aiResponse = response.data.response || '';
            if (!aiResponse || aiResponse.trim() === '') {
                console.error('[AI Client] Empty response from Ollama:', response.data);
                return 'Sorry, I received an empty response. Please try again.';
            }

            return aiResponse.trim();
        } catch (error) {
            console.error('[AI Client] Ollama error details:', error.message);
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Ollama not running. Start with: ollama serve');
            }
            throw error;
        }
    }

    /**
     * Query OpenAI (fallback)
     */
    async queryOpenAI(messages, maxTokens, temperature) {
        try {
            const response = await this.openaiClient.chat.completions.create({
                model: config.openai.model,
                messages,
                max_tokens: maxTokens,
                temperature,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
            if (error.status === 429) {
                throw new Error('OpenAI rate limit exceeded.');
            }
            throw new Error('Open AI request failed.');
        }
    }

    /**
     * Check if client is ready
     */
    isReady() {
        return this.initialized;
    }
}

module.exports = new AIClient();
