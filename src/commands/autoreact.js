const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const autoreactService = require('../services/autoreactService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoreact')
        .setDescription('Manage auto-reactions for channels (e.g. registration confirmations)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => 
            sub.setName('add')
            .setDescription('Add an auto-reaction to a channel')
            .addChannelOption(opt => 
                opt.setName('channel')
                .setDescription('The channel to monitor')
                .setRequired(true))
            .addStringOption(opt =>
                opt.setName('emoji')
                .setDescription('The emoji to react with (custom emoji or unicode)')
                .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('scan')
            .setDescription('React to past messages in a channel')
            .addChannelOption(opt =>
                opt.setName('channel')
                .setDescription('The channel to scan')
                .setRequired(true))
            .addStringOption(opt =>
                opt.setName('emoji')
                .setDescription('The emoji to react with')
                .setRequired(true))
            .addIntegerOption(opt =>
                opt.setName('limit')
                .setDescription('How many past messages to scan (default 50, max 100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
            .setDescription('Remove auto-reactions from a channel')
            .addChannelOption(opt =>
                opt.setName('channel')
                .setDescription('The channel to remove')
                .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
            .setDescription('List all auto-reaction channels')
        ),
    
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        
        if (sub === 'add') {
            const channel = interaction.options.getChannel('channel');
            let emoji = interaction.options.getString('emoji');
            
            // Extract custom emoji ID if it's formatted like <:name:123456789> or <a:name:123456789>
            const customEmojiMatch = emoji.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/);
            if (customEmojiMatch) {
                emoji = customEmojiMatch[1];
            }
            
            autoreactService.addChannel(channel.id, emoji);
            
            await interaction.reply({
                content: `✅ Added auto-reaction. I will now react with ${interaction.options.getString('emoji')} to all messages in <#${channel.id}>.`,
                ephemeral: true
            });
        }
        else if (sub === 'remove') {
            const channel = interaction.options.getChannel('channel');
            const removed = autoreactService.removeChannel(channel.id);
            
            if (removed) {
                await interaction.reply({ content: `✅ Removed auto-reactions for <#${channel.id}>.`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ No auto-reaction was set for <#${channel.id}>.`, ephemeral: true });
            }
        }
        else if (sub === 'list') {
            const channels = autoreactService.getChannels();
            const keys = Object.keys(channels);
            
            if (keys.length === 0) {
                return await interaction.reply({ content: 'No auto-reactions configured.', ephemeral: true });
            }
            
            const list = keys.map(id => {
                const isCustom = channels[id].match(/^\d+$/);
                const emojiStr = isCustom ? `Custom Emoji ID: ${channels[id]}` : channels[id];
                return `<#${id}>: ${emojiStr}`;
            }).join('\n');
            
            await interaction.reply({
                content: `**Auto-Reaction Channels:**\n${list}`,
                ephemeral: true
            });
        }
        else if (sub === 'scan') {
            await interaction.deferReply({ ephemeral: true });
            
            const channel = interaction.options.getChannel('channel');
            let emoji = interaction.options.getString('emoji');
            const limit = interaction.options.getInteger('limit') || 50;
            
            const customEmojiMatch = emoji.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/);
            if (customEmojiMatch) {
                emoji = customEmojiMatch[1];
            }
            
            try {
                const messages = await channel.messages.fetch({ limit });
                let count = 0;
                
                await interaction.editReply(`⏳ Scanning ${messages.size} past messages and applying reactions... (this takes about 1 second per message to avoid Discord rate limits)`);
                
                for (const msg of messages.values()) {
                    if (msg.author.bot) continue; // Don't react to bot messages
                    
                    // Check if bot already reacted with this emoji
                    const alreadyReacted = msg.reactions.cache.some(r => 
                        r.me && (r.emoji.name === emoji || r.emoji.id === emoji)
                    );
                    
                    if (!alreadyReacted) {
                        try {
                            await msg.react(emoji);
                            count++;
                            // Discord rate limits reactions to ~1 per second
                            await new Promise(r => setTimeout(r, 1200));
                        } catch (e) {
                            console.error(`[AutoReact] Failed to react to message ${msg.id}:`, e.message);
                        }
                    }
                }
                
                await interaction.editReply(`✅ Scan complete! Added reactions to ${count} past messages.`);
            } catch (error) {
                console.error('[AutoReact] Scan error:', error);
                await interaction.editReply(`❌ Error scanning channel: ${error.message}`);
            }
        }
    }
};
