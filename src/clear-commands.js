require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🗑️  Clearing all guild commands...');

        // Clear guild commands
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [] }
        );

        console.log('✅ Successfully cleared all guild commands.');

        console.log('🗑️  Clearing all global commands...');

        // Clear global commands
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );

        console.log('✅ Successfully cleared all global commands.');
        console.log('');
        console.log('👉 Now run "npm run deploy" to register only the commands in your /commands folder.');

    } catch (error) {
        console.error('❌ Error clearing commands:', error);
    }
})();
