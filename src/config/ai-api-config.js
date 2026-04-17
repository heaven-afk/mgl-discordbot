// AI Configuration - Support for Gemini, Claude, and OpenAI
require('dotenv').config();

module.exports = {
    // Determine which API to use globally. Default to 'gemini'
    provider: process.env.AI_PROVIDER || 'gemini', // 'gemini', 'claude', or 'openai'

    // Google Gemini (Primary)
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    },

    // Anthropic Claude
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'
    },

    // OpenAI (Fallback/Legacy)
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },

    // General settings
    defaults: {
        maxTokens: 500,
        temperature: 0.7,
        timeout: 90000 
    }
};
