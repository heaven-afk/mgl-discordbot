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
        'uid': 'uid',
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

            // Check for key: value pattern
            const kvMatch = stripped.match(/^([^:]+):\s*(.*)/);
            if (kvMatch) {
                const rawKey = kvMatch[1].trim().toLowerCase();
                // Remove player prefixes like "P1 ", "P2 " etc
                const cleanKey = rawKey.replace(/^p\d+\s+/i, '');
                const field = RosterParser.FIELD_MAP[cleanKey];
                const value = kvMatch[2].trim();

                if (field) {
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

            // Standalone text — potential name or header
            result.push({ type: 'standalone', value: stripped, line, index: i });
        }

        return result;
    }

    /**
     * Remove Discord formatting markers (**, __, ~~, etc.)
     */
    _stripFormatting(text) {
        return text
            .replace(/\*\*/g, '')
            .replace(/__/g, '')
            .replace(/~~/g, '')
            .replace(/`/g, '')
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
     * A player block starts with either:
     *   - A "Professional Name:" field
     *   - A standalone text line followed by player fields (IGN, UID, etc.)
     */
    _extractPlayers(parsed, team) {
        const players = [];
        let currentPlayer = null;

        const flushPlayer = () => {
            if (currentPlayer && currentPlayer.ign) {
                // Inherit team info
                currentPlayer.teamName = currentPlayer.teamName || team.teamName;
                currentPlayer.clanName = currentPlayer.clanName || team.clanName;
                players.push({ ...currentPlayer });
            }
            currentPlayer = null;
        };

        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];

            // Skip consumed, empty, separator, meta, team fields
            if (item._consumed) continue;
            if (item.type === 'empty' || item.type === 'separator' || item.type === 'meta' || item.type === 'numbered') continue;
            if (item.type === 'field' && RosterParser.TEAM_FIELDS.has(item.field)) continue;

            // Player field: start or add to current player
            if (item.type === 'field' && RosterParser.PLAYER_FIELDS.has(item.field)) {
                if (!currentPlayer) {
                    currentPlayer = this._emptyPlayer();
                }

                // If we hit a new professionalName field and current player already has one, flush
                if (item.field === 'professionalName' && currentPlayer.professionalName) {
                    flushPlayer();
                    currentPlayer = this._emptyPlayer();
                }

                // If we hit a new IGN and current player already has one, flush
                if (item.field === 'ign' && currentPlayer.ign) {
                    flushPlayer();
                    currentPlayer = this._emptyPlayer();
                }

                currentPlayer[item.field] = item.value;

                // Handle region containing country flag emoji
                if (item.field === 'region' && !currentPlayer.country) {
                    const countryMatch = this._extractCountryFromRegion(item.value);
                    if (countryMatch) {
                        currentPlayer.country = countryMatch;
                    }
                }

                continue;
            }

            // Standalone line — check if it's a Professional Name
            if (item.type === 'standalone') {
                // Look ahead: if the next meaningful item is a player field (like IGN), this is a pro name
                const nextField = this._findNextField(parsed, i + 1);

                if (nextField && RosterParser.PLAYER_FIELDS.has(nextField.field)) {
                    // This standalone line is a professional name
                    flushPlayer();
                    currentPlayer = this._emptyPlayer();
                    currentPlayer.professionalName = item.value;
                    continue;
                }
            }
        }

        // Flush last player
        flushPlayer();

        return players;
    }

    /**
     * Find the next field-type item in parsed array
     */
    _findNextField(parsed, startIndex) {
        for (let i = startIndex; i < parsed.length; i++) {
            if (parsed[i].type === 'field') return parsed[i];
            if (parsed[i].type === 'standalone') return null; // Another standalone before a field — break
            // Skip empty/separator/meta
        }
        return null;
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
            if (region.includes(flag)) return country;
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
        const headers = ['SLOT', 'Professional Name', 'IGN', 'UID', 'Team Name', 'Clan Name', 'Discord', 'Device', 'Region', 'Country', 'Serial Number'];
        if (sourceName) headers.push('Source');

        const rows = allPlayers.map(p => {
            const slot = slotMap ? (this.matchSlot(p.teamName, slotMap) || '') : '';
            const row = [
                slot,
                this._csvEscape(p.professionalName || ''),
                this._csvEscape(p.ign || ''),
                this._csvEscape(p.uid || ''),
                this._csvEscape(p.teamName || ''),
                this._csvEscape(p.clanName || ''),
                this._csvEscape(p.discord || ''),
                this._csvEscape(p.device || ''),
                this._csvEscape(p.region || ''),
                this._csvEscape(p.country || ''),
                this._csvEscape(p.serialNumber || '')
            ];

            if (sourceName) row.push(this._csvEscape(sourceName));
            return row.join(',');
        });

        return Buffer.from([headers.join(','), ...rows].join('\n'), 'utf-8');
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
