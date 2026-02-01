# Discord Message Bot

A production-ready Discord bot for message management, backup, and sticky notes.

## Features
- **/move**: Transfer messages between channels/threads.
- **/backup**: Export channel history to JSON/HTML.
- **/stickynote**: Manage persistent pinned messages.

## Setup
1.  Clone the repository.
2.  Run `npm install` to install dependencies.
3.  Copy `.env.example` to `.env` and fill in your Discord credentials.
    - `DISCORD_TOKEN`: Your bot's token.
    - `CLIENT_ID`: Your bot's application ID.
    - `GUILD_ID`: The ID of the server where commands will be registered.
4.  Run `npm run deploy` to register slash commands.
5.  Run `npm start` to launch the bot.

## Development
- `npm run dev`: Run with watch mode.
