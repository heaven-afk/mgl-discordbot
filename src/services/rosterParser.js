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
     * Parse a single registration message into team + players data using AI fallback.
     * @param {string} content - Raw message content
     * @returns {Promise<object|null>} { team: {...}, players: [...] } or null if not a registration
     */
    async parseMessageWithAI(content) {
        if (!content || content.trim().length < 10) return null;

        aiClient.init();

        const systemPrompt = `You are a strict data extraction tool. Extract team and player registration data from the user message into a strict JSON object.
Schema:
{
  "team": { "teamName": "string|null", "clanName": "string|null", "teamManager": "string|null", "teamTag": "string|null", "tier": "string|null" },
  "players": [
    { "professionalName": "string|null", "ign": "string|null", "uid": "string|null", "discord": "string|null", "device": "string|null", "region": "string|null", "country": "string|null", "gender": "string|null", "serialNumber": "string|null" }
  ]
}

- Output NOTHING BUT RAW JSON. NO Markdown formatting, NO wrapping \`\`\`json, NO text. Just the JSON object.
- If you can't find players or assume it's just normal chat, return {"team": {}, "players": []}.
- "device" should capture phone model if available.
- "region" should capture continent/region.
- Look at the text carefully to extract all players and assign them to the "players" array. Try your best even if formatting is messy.`;

        try {
            const resultText = await aiClient.generateChatResponse([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: content }
            ], { temperature: 0.1, maxTokens: 1000 });

            if (!resultText) return null;

            // Extract JSON from response (robust against text before/after or markdown wrappers)
            const jsonMatch = resultText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('[RosterParser] AI returned no JSON structure:', resultText);
                return null;
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.players || !Array.isArray(parsed.players) || parsed.players.length === 0) {
                return null;
            }

            // Clean up missing fields according to standard RosterParser model
            const team = {
                teamName: parsed.team?.teamName || null,
                clanName: parsed.team?.clanName || null,
                teamManager: parsed.team?.teamManager || null,
                teamTag: parsed.team?.teamTag || null,
                tier: parsed.team?.tier || null
            };

            const players = parsed.players.map(p => ({
                professionalName: p.professionalName || null,
                ign: p.ign || null,
                uid: p.uid || null,
                teamName: team.teamName,
                clanName: team.clanName,
                discord: p.discord || null,
                device: p.device || null,
                region: p.region || null,
                country: p.country || null,
                gender: p.gender || null,
                serialNumber: p.serialNumber || null
            }));

            // Filter out players without IGN
            const validPlayers = players.filter(p => p.ign);
            if (validPlayers.length === 0) return null;

            return { team, players: validPlayers };

        } catch (error) {
            console.error('[RosterParser] AI Parse error:', error.message);
            return null; // Fallback to failure
        }
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
