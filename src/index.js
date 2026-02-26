require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const stickyService = require('./services/stickyService');
const smartService = require('./services/smartService');
const smartConfig = require('./services/smartConfig');
const memoryService = require('./services/memoryService');
const cooldownManager = require('./utils/cooldownManager');
const aiClient = require('./services/aiClient');
const keepAlive = require('./keepAlive');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
// Ensure commands directory exists before reading
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.once(Events.ClientReady, (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);

    // Initialize sticky service
    stickyService.init(client);

    // Initialize AI client
    aiClient.init();

    // Start cooldown cleanup interval (every 5 minutes)
    setInterval(() => {
        cooldownManager.cleanup();
    }, 5 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
    // 1. Chat Input Commands (Slash Commands)
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // Permission Check
        const permissionGuard = require('./modules/permissionGuard');
        if (!permissionGuard.isAllowed(interaction.member, interaction.commandName)) {
            return await interaction.reply({
                content: '❌ You do not have the required permission tier to use this command.',
                ephemeral: true
            });
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        return;
    }

    // 2. Button Interactions
    if (interaction.isButton()) {
        try {
            const buttonHandler = require('./interactions/buttonHandler');
            await buttonHandler.handle(interaction);
        } catch (error) {
            console.error('Error handling button interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred processing this button.', ephemeral: true });
            }
        }
        return;
    }

    // 3. Modal Submissions
    if (interaction.isModalSubmit()) {
        try {
            // Handle embed creator modals
            if (interaction.customId.startsWith('embed_create_')) {
                const embedCommand = require('./commands/embed');
                return await embedCommand.handleModal(interaction);
            }

            // Handle announcement modals
            const modalHandler = require('./interactions/modalHandler');
            await modalHandler.handle(interaction);
        } catch (error) {
            console.error('Error handling modal submission:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred processing this submission.', ephemeral: true });
            }
        }
        return;
    }
});

// Listener for messages (sticky notes + auto assistant)
client.on(Events.MessageCreate, async (message) => {
    // Handle sticky notes first
    await stickyService.handleMessage(message);

    // Auto assistant logic
    if (message.author.bot) return; // Ignore bot messages
    if (!message.guild) return; // Ignore DMs

    const enabled = smartConfig.get('enabled');
    const auto = smartConfig.get('auto');

    if (!enabled || !auto) return;

    // Check if channel is allowed
    if (!smartConfig.isChannelAllowed(message.channel.id)) {
        return;
    }

    // Check if message should trigger auto response
    if (!smartService.shouldTriggerAuto(message, client)) {
        // Increment message counter for memory updates
        if (smartConfig.get('memory') === 'summaries') {
            const count = memoryService.incrementMessageCount(message.channel.id);

            // Update memory if threshold reached
            if (memoryService.shouldUpdate(message.channel.id, 20, 10)) {
                try {
                    const messages = await message.channel.messages.fetch({ limit: 30 });
                    const summary = memoryService.generateSummary(Array.from(messages.values()));
                    memoryService.setMemory(message.channel.id, summary);
                    memoryService.markUpdated(message.channel.id);
                } catch (error) {
                    console.error('[Auto Assistant] Error updating memory:', error);
                }
            }
        }
        return;
    }

    // Check cooldowns
    const channelCooldown = smartConfig.get('cooldown_channel');
    const autoUserCooldown = smartConfig.get('cooldown_auto_user');

    if (cooldownManager.isChannelOnCooldown(message.channel.id, channelCooldown)) {
        console.log(`[Auto Assistant] Channel ${message.channel.id} on cooldown`);
        return;
    }

    if (cooldownManager.isAutoUserOnCooldown(message.author.id, autoUserCooldown)) {
        console.log(`[Auto Assistant] User ${message.author.id} on auto cooldown`);
        return;
    }

    console.log(`[Auto Assistant] Triggered by ${message.author.tag} in ${message.channel.name}`);

    try {
        // Generate response
        const response = await smartService.generateResponse(message.channel, {
            mode: 'reply',
            depth: 'standard',
            userMessage: message.content
        });

        // Set cooldowns
        cooldownManager.setChannelCooldown(message.channel.id);
        cooldownManager.setAutoUserCooldown(message.author.id);

        // Send response
        await message.reply(response);

        console.log(`[Auto Assistant] Responded successfully`);
    } catch (error) {
        console.error('[Auto Assistant] Error generating response:', error);
    }
});

// Start keep-alive server for Replit
keepAlive();

client.login(process.env.DISCORD_TOKEN);
