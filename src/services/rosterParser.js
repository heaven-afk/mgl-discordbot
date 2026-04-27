const aiClient = require('./aiClient');

/**
 * Roster Parser Service
 * Parses semi-structured team registration messages from Discord.
 * Handles two main format patterns:
 *   Pattern A: Labeled fields (Professional Name: X, IGN: Y)
 *   Pattern B: Standalone bold/caps names before player details
 */

class RosterParser {

    /**
     * Known field aliases — maps variations to canonical field names
     */
    static FIELD_MAP = {
        // Player fields
        'professional name': 'professionalName',
        'pro name': 'professionalName',
        'name': 'professionalName',
        'player name': 'professionalName',
        'ign': 'ign',
        'in game name': 'ign',
        'in-game name': 'ign',
        'ingame name': 'ign',
        'ign + discord': 'ign',
        'player': 'ign',
        'p1': 'ign', 'p2': 'ign', 'p3': 'ign', 'p4': 'ign', 'p5': 'ign', 'p6': 'ign', 'p7': 'ign', 'p8': 'ign',
        'uid': 'uid',
        'udi': 'uid',
        'user id': 'uid',
        'discord': 'discord',
        'discord id': 'discord',
        'discord name': 'discord',
        'device': 'device',
        'phone': 'device',
        'region': 'region',
        'country': 'country',
        'gender': 'gender',
        'serial number': 'serialNumber',
        'serial': 'serialNumber',
        'serial no': 'serialNumber',
        's/n': 'serialNumber',

        // Team fields
        'team name': 'teamName',
        'team': 'teamName',
        'clan name': 'clanName',
        'clan': 'clanName',
        'org': 'clanName',
        'organization': 'clanName',
        'team manager': 'teamManager',
        'manager': 'teamManager',
        'team tag': 'teamTag',
        'tag': 'teamTag',
        'tier': 'tier',
        'tier request': 'tier',
    };

    static TEAM_FIELDS = new Set(['teamName', 'clanName', 'teamManager', 'teamTag', 'tier']);
    static PLAYER_FIELDS = new Set(['professionalName', 'ign', 'uid', 'discord', 'device', 'region', 'country', 'gender', 'serialNumber']);

    /**
     * Parse a single registration message into team + players data.
     * @param {string} content - Raw message content
     * @returns {object|null} { team: {...}, players: [...] } or null if not a registration
     */
    parseMessage(content) {
        if (!content || content.trim().length < 10) return null;

        const lines = content.split('\n').map(l => l.trim());

        // Step 1: Extract all key:value pairs and identify standalone lines
        const parsed = this._classifyLines(lines);

        // Step 2: Build team info from team-level fields
        const team = this._extractTeamInfo(parsed);

        // Step 3: Split into player blocks and extract player data
        const players = this._extractPlayers(parsed, team);

        // If we found no players with at least an IGN, this isn't a registration
        if (players.length === 0) return null;

        return { team, players };
    }

    /**
     * The core AI system prompt for registration extraction.
     * Uses a two-phase approach: SCAN all context first, then EXTRACT.
     */
    static AI_EXTRACTION_PROMPT = `You are extracting player registration data from competitive gaming tournament messages.

PHASE 1 — SCAN (do not extract yet):
Before extracting anything, read ALL messages provided and identify:
- Every unique team name, team tag, and clan name mentioned
- The pattern of IGN formatting per team (shared prefix, symbol, or tag)
- Which messages belong to the same team registration block

PHASE 2 — EXTRACT:
Only after scanning all messages, extract each player with these fields:
- professionalName: the player's pro/display name
- ign: In-Game Name — identified by shared tag/prefix/symbol consistent with teammates
- teamName: full team name (not tag)
- clanName: clan name if separately stated, otherwise empty
- country: country name in UPPERCASE, no flags or emojis
- region: only if explicitly stated (e.g. Africa, Europe), otherwise empty
- device: device name in UPPERCASE

RULES:
- All values must be UPPERCASE
- IGNs share a consistent tag, symbol, or prefix with teammates — use this to identify them when the label is missing
- If a field is not present, return an empty string — do not guess
- A player block may span multiple lines and fields may appear in any order
- Do not extract managers, captains, or staff — only players (P1–P6, S1–S2)
- Do not include UID, Discord, or serial numbers
- Output NOTHING BUT RAW JSON. NO Markdown formatting, NO wrapping \`\`\`json, NO text. Just the JSON object.
- If you can't find players or assume it's just normal chat, return {"teams": []}.

Return ONLY a valid JSON object in this exact shape:
{
  "teams": [
    {
      "team": {
        "teamName": "",
        "clanName": ""
      },
      "players": [
        {
          "professionalName": "",
          "ign": "",
          "teamName": "",
          "clanName": "",
          "country": "",
          "region": "",
          "device": ""
        }
      ]
    }
  ]
}`;

    /**
     * Parse a single registration message into team + players data using AI.
     * @param {string} content - Raw message content
     * @returns {Promise<object|null>} { team: {...}, players: [...] } or null if not a registration
     */
    async parseMessageWithAI(content) {
        if (!content || content.trim().length < 10) return null;

        aiClient.init();

        try {
            const resultText = await aiClient.generateChatResponse([
                { role: 'system', content: RosterParser.AI_EXTRACTION_PROMPT },
                { role: 'user', content: content }
            ], { temperature: 0.1, maxTokens: 2000 });

            if (!resultText) return null;

            const jsonMatch = resultText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('[RosterParser] AI returned no JSON structure:', resultText);
                return null;
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Handle both old single-team and new multi-team format
            if (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length > 0) {
                // New multi-team format — return first team for single-message compat
                const first = parsed.teams[0];
                return this._normalizeAIResult(first);
            } else if (parsed.team && parsed.players) {
                // Legacy single-team format fallback
                return this._normalizeAIResult(parsed);
            }

            return null;
        } catch (error) {
            console.error('[RosterParser] AI Parse error:', error.message);
            return null;
        }
    }

    /**
     * Parse multiple registration messages in a single AI batch for superior cross-message context.
     * Groups all messages together so the AI can identify team patterns, shared tags, and IGN prefixes
     * across the entire registration channel.
     * @param {Array<{id: string, author: string, content: string}>} messages - Array of message objects
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<Array<{team: object, players: Array}>>} Array of team results
     */
    async parseBatchWithAI(messages, progressCallback = null) {
        if (!messages || messages.length === 0) return [];

        aiClient.init();

        const allResults = [];
        // Process in chunks of 15 messages to stay within token limits
        const CHUNK_SIZE = 15;
        const chunks = [];
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            chunks.push(messages.slice(i, i + CHUNK_SIZE));
        }

        for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];

            if (progressCallback) {
                progressCallback(ci + 1, chunks.length, chunk.length);
            }

            // Format messages with clear separators
            const formatted = chunk.map((m, idx) => {
                return `--- MESSAGE ${idx + 1} (by ${m.author}) ---\n${m.content}`;
            }).join('\n\n');

            try {
                const resultText = await aiClient.generateChatResponse([
                    { role: 'system', content: RosterParser.AI_EXTRACTION_PROMPT },
                    { role: 'user', content: formatted }
                ], { temperature: 0.1, maxTokens: 4000 });

                if (!resultText) continue;

                const jsonMatch = resultText.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    console.error('[RosterParser] AI batch returned no JSON:', resultText.substring(0, 200));
                    continue;
                }

                const parsed = JSON.parse(jsonMatch[0]);

                if (parsed.teams && Array.isArray(parsed.teams)) {
                    for (const teamBlock of parsed.teams) {
                        const normalized = this._normalizeAIResult(teamBlock);
                        if (normalized && normalized.players.length > 0) {
                            allResults.push(normalized);
                        }
                    }
                } else if (parsed.team && parsed.players) {
                    const normalized = this._normalizeAIResult(parsed);
                    if (normalized && normalized.players.length > 0) {
                        allResults.push(normalized);
                    }
                }

            } catch (error) {
                console.error(`[RosterParser] AI Batch chunk ${ci + 1} error:`, error.message);
            }

            // Rate limit guard between chunks
            if (ci < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        return allResults;
    }

    /**
     * Normalize an AI result block into the standard { team, players } format.
     * Enforces UPPERCASE on all values and strips excluded fields.
     * @private
     */
    _normalizeAIResult(block) {
        if (!block) return null;

        const team = {
            teamName: this._toUpperOrEmpty(block.team?.teamName),
            clanName: this._toUpperOrEmpty(block.team?.clanName),
        };

        if (!block.players || !Array.isArray(block.players) || block.players.length === 0) {
            return null;
        }

        const players = block.players.map(p => ({
            professionalName: this._toUpperOrEmpty(p.professionalName),
            ign: this._toUpperOrEmpty(p.ign),
            teamName: this._toUpperOrEmpty(p.teamName) || team.teamName,
            clanName: this._toUpperOrEmpty(p.clanName) || team.clanName,
            device: this._toUpperOrEmpty(p.device),
            region: this._toUpperOrEmpty(p.region),
            country: this._toUpperOrEmpty(p.country),
        }));

        // Filter out players without IGN
        const validPlayers = players.filter(p => p.ign);
        if (validPlayers.length === 0) return null;

        return { team, players: validPlayers };
    }

    /**
     * Convert a value to uppercase string, or return empty string if falsy.
     * @private
     */
    _toUpperOrEmpty(val) {
        if (!val || typeof val !== 'string' || val.trim() === '') return '';
        return val.trim().toUpperCase();
    }

    /**
     * Classify each line as: field (key:value), standalone (potential name/header), or empty
     */
    _classifyLines(lines) {
        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const stripped = this._stripFormatting(line);

            if (!stripped) {
                result.push({ type: 'empty', line, index: i });
                continue;
            }

            // Check for key: value pattern using the STRIPPED line to detect the key,
            // but extract the VALUE from the ORIGINAL line to preserve all symbols.
            const colonIdx = stripped.indexOf(':');
            if (colonIdx > -1) {
                const rawKey = stripped.substring(0, colonIdx).trim().toLowerCase();
                // Remove player prefixes like "P1 ", "P2 " etc
                const cleanKey = rawKey.replace(/^p\d+\s+/i, '');
                const field = RosterParser.FIELD_MAP[cleanKey];

                if (field) {
                    // Find the colon in the ORIGINAL line and take the raw value after it
                    const originalColonIdx = line.indexOf(':');
                    let value = originalColonIdx > -1 ? line.substring(originalColonIdx + 1).trim() : '';
                    // Strip Discord formatting but leave actual symbols/emojis intact
                    value = this._stripFormatting(value);
                    result.push({ type: 'field', field, value, rawKey, line, index: i });
                    continue;
                }
            }

            // Check for numbered list items (slot list)
            const numMatch = stripped.match(/^\d+\.\s+(.+)/);
            if (numMatch) {
                result.push({ type: 'numbered', value: numMatch[1].trim(), line, index: i });
                continue;
            }

            // Check for "Tier X Request" pattern
            const tierMatch = stripped.match(/^tier\s+\d+\s*request?/i);
            if (tierMatch) {
                result.push({ type: 'meta', value: stripped, line, index: i });
                continue;
            }

            // Check for separator lines (underscores, dashes, etc)
            if (/^[_\-=~]{2,}$/.test(stripped)) {
                result.push({ type: 'separator', line, index: i });
                continue;
            }

            // Standalone text — keep the original line text to preserve symbols
            result.push({ type: 'standalone', value: line.trim(), line, index: i });
        }

        return result;
    }

    /**
     * Remove Discord formatting markers (**, __, ~~, etc.)
     */
    _stripFormatting(text) {
        return String(text)
            .replace(/^[>#\-\s]+/g, '') // Remove blockquotes, headings, lists, and leading spaces
            .replace(/\*\*/g, '')
            .replace(/__/g, '')
            .replace(/~~/g, '')
            .replace(/`/g, '')
            .replace(/\|\|/g, '') // Remove spoiler tags ||
            .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\r]/g, '') // Remove invisible layout chars
            .trim();
    }

    /**
     * Extract team-level information from classified lines
     */
    _extractTeamInfo(parsed) {
        const team = {
            teamName: null,
            clanName: null,
            teamManager: null,
            teamTag: null,
            tier: null
        };

        // First pass: grab explicit team fields
        for (const item of parsed) {
            if (item.type === 'field' && RosterParser.TEAM_FIELDS.has(item.field)) {
                team[item.field] = item.value || null;
            }
        }

        // Second pass: if no clan name, check first standalone line as potential clan/org name
        if (!team.clanName) {
            const firstStandalone = parsed.find(p => p.type === 'standalone');
            if (firstStandalone) {
                // Check if it appears before any player fields
                const firstPlayerField = parsed.find(p =>
                    p.type === 'field' && RosterParser.PLAYER_FIELDS.has(p.field)
                );
                if (!firstPlayerField || firstStandalone.index < firstPlayerField.index) {
                    // Likely a clan/org name header
                    team.clanName = firstStandalone.value;
                    firstStandalone._consumed = true;
                }
            }
        }

        return team;
    }

    /**
     * Extract player blocks from classified lines.
     * Uses a grouping strategy separating players when duplicate fields (like IGN) are hit.
     */
    _extractPlayers(parsed, team) {
        let players = [];
        let currentFields = [];

        // Group into raw player blocks
        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            
            if (item._consumed || item.type === 'empty' || item.type === 'separator' || item.type === 'meta' || item.type === 'numbered' || (item.type === 'field' && RosterParser.TEAM_FIELDS.has(item.field))) {
                continue;
            }

            if (item.type === 'field' && RosterParser.PLAYER_FIELDS.has(item.field)) {
                // Split if currentFields already has this exact field (e.g., another IGN)
                const alreadyHasField = currentFields.some(f => f.type === 'field' && f.field === item.field);
                if (alreadyHasField && ['ign', 'professionalName', 'uid', 'discord', 'device', 'country'].includes(item.field)) {
                    const block = [...currentFields];
                    currentFields = [];
                    
                    // Move trailing standalones to new block IF they are closer to `item` than to the preceding fields in `block`
                    while (block.length > 0 && block[block.length - 1].type === 'standalone') {
                        const trailing = block[block.length - 1];
                        const lastRealField = block.slice().reverse().find(f => f.type === 'field');
                        
                        const distToPrev = lastRealField ? (trailing.index - lastRealField.index) : 999;
                        const distToNext = item.index - trailing.index;

                        if (distToNext < distToPrev) {
                            currentFields.unshift(block.pop());
                        } else {
                            break;
                        }
                    }

                    players.push(block);
                }
                
                currentFields.push(item);
            } else if (item.type === 'standalone') {
                 if (item.value.length < 50) currentFields.push(item);
            }
        }
        
        if (currentFields.length > 0) players.push(currentFields);

        // Process blocks into player objects
        const finalPlayers = [];
        for (const block of players) {
            let p = this._emptyPlayer();
            let standalones = [];

            for (const item of block) {
                if (item.type === 'field') {
                    if (item.field === 'region' || item.field === 'country') {
                        const match = this._extractCountryFromRegion(item.value);
                        if (match) {
                            if (item.field === 'region' && !p.country) p.country = match.country;
                            p[item.field] = match.cleanRegion || match.country;
                        } else {
                            p[item.field] = item.value;
                        }
                    } else {
                        p[item.field] = item.value;
                    }
                } else if (item.type === 'standalone') {
                    standalones.push(item.value);
                }
            }

            if (!p.professionalName && standalones.length > 0) {
                p.professionalName = standalones[standalones.length - 1];
            }

            if (p.ign) {
                // Auto-Correct IGN / Pro Name if swapped manually by user (based on symbol density)
                if (p.professionalName && p.ign) {
                    const standardRegex = /[a-zA-Z0-9\s_]/g;
                    const proSymbols = p.professionalName.replace(standardRegex, '').length;
                    const ignSymbols = p.ign.replace(standardRegex, '').length;
                    
                    if (proSymbols > ignSymbols && ignSymbols <= 1 && proSymbols > 1) {
                         const temp = p.professionalName; 
                         p.professionalName = p.ign; 
                         p.ign = temp;
                    }
                }
                
                p.teamName = p.teamName || team.teamName;
                p.clanName = p.clanName || team.clanName;
                finalPlayers.push(p);
            }
        }

        return finalPlayers;
    }

    /**
     * Try to extract country name from region string like "Africa 🇳🇬"
     */
    _extractCountryFromRegion(region) {
        // Common flag emoji to country mapping for esports regions
        const flagMap = {
            '🇳🇬': 'Nigeria', '🇿🇦': 'South Africa', '🇬🇭': 'Ghana', '🇰🇪': 'Kenya',
            '🇺🇸': 'USA', '🇬🇧': 'UK', '🇨🇦': 'Canada', '🇦🇺': 'Australia',
            '🇮🇳': 'India', '🇧🇷': 'Brazil', '🇩🇪': 'Germany', '🇫🇷': 'France',
            '🇪🇸': 'Spain', '🇮🇹': 'Italy', '🇯🇵': 'Japan', '🇰🇷': 'South Korea',
            '🇲🇽': 'Mexico', '🇦🇷': 'Argentina', '🇨🇴': 'Colombia', '🇵🇭': 'Philippines',
            '🇮🇩': 'Indonesia', '🇲🇾': 'Malaysia', '🇸🇬': 'Singapore', '🇹🇭': 'Thailand',
            '🇪🇬': 'Egypt', '🇲🇦': 'Morocco', '🇹🇿': 'Tanzania', '🇺🇬': 'Uganda',
            '🇨🇲': 'Cameroon', '🇸🇳': 'Senegal', '🇨🇮': 'Ivory Coast', '🇿🇼': 'Zimbabwe',
            '🇷🇼': 'Rwanda', '🇪🇹': 'Ethiopia', '🇲🇿': 'Mozambique',
        };

        // Check for flag emoji in the string
        for (const [flag, country] of Object.entries(flagMap)) {
            if (region.includes(flag)) {
                return { country, cleanRegion: region.replace(flag, '').trim() };
            }
        }

        return null;
    }

    /**
     * Create empty player object
     */
    _emptyPlayer() {
        return {
            professionalName: null,
            ign: null,
            uid: null,
            teamName: null,
            clanName: null,
            discord: null,
            device: null,
            region: null,
            country: null,
            gender: null,
            serialNumber: null
        };
    }

    // =====================================================
    // SLOT LIST PARSING
    // =====================================================

    /**
     * Parse a numbered slot list message into { number: teamName } map
     * Input format:
     *   1. Nemesis Spartans
     *   2. Wicked Esports
     */
    parseSlotList(content) {
        const slots = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const match = line.trim().match(/^(\d+)[.)]\s*(.+)/);
            if (match) {
                const num = parseInt(match[1]);
                const name = match[2].replace(/\*\*/g, '').replace(/__/g, '').trim().replace(/\.+$/, '').trim();
                if (name) slots[num] = name;
            }
        }

        return slots;
    }

    /**
     * Match a team name to a slot using fuzzy matching
     */
    matchSlot(teamName, slotMap) {
        if (!teamName || !slotMap || Object.keys(slotMap).length === 0) return null;

        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const normalizedTeam = normalize(teamName);

        // Exact match first
        for (const [slot, name] of Object.entries(slotMap)) {
            if (normalize(name) === normalizedTeam) return parseInt(slot);
        }

        // Partial / contains match
        for (const [slot, name] of Object.entries(slotMap)) {
            const normalizedSlot = normalize(name);
            if (normalizedSlot.includes(normalizedTeam) || normalizedTeam.includes(normalizedSlot)) {
                return parseInt(slot);
            }
        }

        // Word overlap match (>= 50% of words match)
        const teamWords = normalizedTeam.split(/\s+/);
        for (const [slot, name] of Object.entries(slotMap)) {
            const slotWords = normalize(name).split(/\s+/);
            const overlap = teamWords.filter(w => slotWords.includes(w)).length;
            const threshold = Math.max(1, Math.floor(Math.min(teamWords.length, slotWords.length) * 0.5));
            if (overlap >= threshold) return parseInt(slot);
        }

        return null;
    }

    // =====================================================
    // CSV / JSON GENERATION
    // =====================================================

    /**
     * Convert parsed results to CSV buffer
     */
    toCSV(allPlayers, slotMap = null, sourceName = null) {
        const headers = ['SLOT', 'Professional Name', 'IGN', 'Team Name', 'Clan Name', 'Device', 'Region', 'Country'];
        if (sourceName) headers.push('Source');

        const rows = allPlayers.map(p => {
            const slot = slotMap ? (this.matchSlot(p.teamName, slotMap) || '') : '';
            const row = [
                slot,
                this._csvEscape(p.professionalName || ''),
                this._csvEscape(p.ign || ''),
                this._csvEscape(p.teamName || ''),
                this._csvEscape(p.clanName || ''),
                this._csvEscape(p.device || ''),
                this._csvEscape(p.region || ''),
                this._csvEscape(p.country || '')
            ];

            if (sourceName) row.push(this._csvEscape(sourceName));
            return row.join(',');
        });

        return Buffer.from('\uFEFF' + [headers.join(','), ...rows].join('\n'), 'utf-8');
    }

    /**
     * Convert parsed results to JSON buffer
     */
    toJSON(allPlayers, slotMap = null, sourceName = null) {
        const data = allPlayers.map(p => {
            const slot = slotMap ? (this.matchSlot(p.teamName, slotMap) || null) : null;
            const obj = { slot, ...p };
            if (sourceName) obj.source = sourceName;
            return obj;
        });

        return Buffer.from(JSON.stringify({ count: data.length, players: data }, null, 2), 'utf-8');
    }

    _csvEscape(str) {
        if (!str) return '';
        const s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    }
}

module.exports = new RosterParser();
