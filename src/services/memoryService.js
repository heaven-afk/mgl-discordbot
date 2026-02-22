const fs = require('fs');
const path = require('path');
const aiClient = require('./aiClient');

const MEMORY_PATH = path.join(__dirname, '../storage/channelMemory.json');

/**
 * Memory service for channel summaries
 */
class MemoryService {
    constructor() {
        this.memories = new Map();
        this.messageCounters = new Map();
        this.lastUpdateTimes = new Map();
        this.load();
    }

    /**
     * Load memories from file
     */
    load() {
        try {
            if (fs.existsSync(MEMORY_PATH)) {
                const data = fs.readFileSync(MEMORY_PATH, 'utf8');
                const parsed = JSON.parse(data);
                this.memories = new Map(Object.entries(parsed));
            }
        } catch (error) {
            console.error('[Memory Service] Error loading memories:', error);
        }
    }

    /**
     * Save memories to file
     */
    save() {
        try {
            const dir = path.dirname(MEMORY_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const obj = Object.fromEntries(this.memories);
            fs.writeFileSync(MEMORY_PATH, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.error('[Memory Service] Error saving memories:', error);
        }
    }

    /**
     * Get memory for a channel
     * @param {string} channelId 
     * @returns {Object|null}
     */
    getMemory(channelId) {
        return this.memories.get(channelId) || null;
    }

    /**
     * Set memory for a channel
     * @param {string} channelId 
     * @param {Object} memory 
     */
    setMemory(channelId, memory) {
        this.memories.set(channelId, {
            ...memory,
            lastUpdated: new Date().toISOString()
        });
        this.save();
    }

    /**
     * Increment message counter
     * @param {string} channelId 
     * @returns {number}
     */
    incrementMessageCount(channelId) {
        const current = this.messageCounters.get(channelId) || 0;
        const newCount = current + 1;
        this.messageCounters.set(channelId, newCount);
        return newCount;
    }

    /**
     * Reset message counter
     * @param {string} channelId 
     */
    resetMessageCount(channelId) {
        this.messageCounters.set(channelId, 0);
    }

    /**
     * Check if memory should be updated
     * @param {string} channelId 
     * @param {number} messageThreshold 
     * @param {number} timeThresholdMinutes 
     * @returns {boolean}
     */
    shouldUpdate(channelId, messageThreshold = 20, timeThresholdMinutes = 10) {
        // Check message count
        const messageCount = this.messageCounters.get(channelId) || 0;
        if (messageCount >= messageThreshold) {
            return true;
        }

        // Check time elapsed
        const lastUpdate = this.lastUpdateTimes.get(channelId);
        if (!lastUpdate) return false;

        const elapsed = Date.now() - lastUpdate;
        const minutesElapsed = elapsed / (1000 * 60);

        return minutesElapsed >= timeThresholdMinutes && messageCount > 0;
    }

    /**
     * Mark as updated
     * @param {string} channelId 
     */
    markUpdated(channelId) {
        this.lastUpdateTimes.set(channelId, Date.now());
        this.resetMessageCount(channelId);
    }

    /**
     * Generate summary from messages
     * @param {Array} messages 
     * @returns {Object}
     */
    /**
     * Generate summary from messages using AI
     * @param {Array} messages 
     * @returns {Promise<Object>}
     */
    async generateSummary(messages) {
        // Format messages for AI
        const conversationText = messages.map(m => `${m.author.username}: ${m.content}`).join('\n');

        const systemPrompt = `You are an AI memory manager. 
Analyze the provided Discord conversation log.
Output a JSON object with these fields:
- topic: (string) Main topic of discussion (max 5 words)
- status: (string) Brief status of the conversation (max 10 words)
- keyPoints: (array of strings) 3 most important facts or decisions
- openQuestions: (array of strings) Unanswered questions
- summary: (string) A 2-sentence summary of what happened.`;

        const userPrompt = `Here is the conversation:\n\n${conversationText}\n\nGenerate the JSON memory object.`;

        try {
            const response = await aiClient.generateChatResponse([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ], { maxTokens: 400, temperature: 0.3 });

            // Parse approximate JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // Fallback if no JSON found
            return {
                topic: 'Conversation',
                status: 'Active',
                keyPoints: [response.substring(0, 100)],
                summary: response.substring(0, 200)
            };

        } catch (error) {
            console.error('[Memory] AI Summarization failed:', error);
            // Fallback to simple stats
            return {
                topic: 'General Chat',
                status: `${messages.length} messages processed`,
                summary: 'AI summarization failed.',
                messageCount: messages.length
            };
        }
    }
}

module.exports = new MemoryService();
