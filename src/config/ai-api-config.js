// Simple AI Configuration - Ollama (Local, Free, Unlimited)
require('dotenv').config();

module.exports = {
    // Ollama - Local AI (no API key needed!)
    ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        defaultModel: process.env.OLLAMA_MODEL || 'phi',
        timeout: 90000  // 90 seconds for first-time model loading
    },

    // OpenAI - Optional premium fallback
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },

    // General settings
    defaults: {
        maxTokens: 500,
        temperature: 0.7,
        timeout: 90000  // Increased for model loading
    }
};
