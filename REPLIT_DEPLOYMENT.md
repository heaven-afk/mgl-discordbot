# Deploying to Replit

Follow these steps to deploy your Discord bot to Replit and keep it online 24/7.

## Step 1: Create a Replit Account
1. Go to [replit.com](https://replit.com) and sign up for a free account.

## Step 2: Import Your Project
1. Click **+ Create Repl** in your dashboard.
2. Select **Import from GitHub** (or upload files manually).
3. If using GitHub:
   - Push your local project to a GitHub repository first.
   - Paste the repository URL in Replit.
4. If uploading manually:
   - Select **Node.js** as the template.
   - Upload all project files via the file explorer.

## Step 3: Configure Environment Variables
1. In your Repl, click the **Secrets** tab (lock icon) in the left sidebar.
2. Add the following secrets:
   - `DISCORD_TOKEN` = Your bot token
   - `CLIENT_ID` = Your application ID
   - `GUILD_ID` = Your server ID

## Step 4: Install Dependencies
In the Replit Shell, run:
```bash
npm install
```

## Step 5: Deploy Commands
Run the deployment script:
```bash
npm run deploy
```

## Step 6: Start the Bot
Click the **Run** button at the top of the Replit interface, or run:
```bash
npm start
```

The bot should now be online! You'll see:
- "Ready! Logged in as [Bot Name]"
- "Keep-alive server running on port 3000"

## Step 7: Keep Bot Online (Optional - Paid Feature)
Replit's free tier will put your bot to sleep after inactivity. To keep it online 24/7:

### Option A: Replit Always On (Paid)
- Upgrade to Replit's **Hacker Plan** ($7/month).
- Enable **Always On** in your Repl settings.

### Option B: External Uptime Monitor (Free)
Use a service like [UptimeRobot](https://uptimerobot.com) to ping your Repl every 5 minutes:
1. Get your Repl's URL (e.g., `https://your-repl-name.username.repl.co`).
2. Create a monitor in UptimeRobot that pings this URL every 5 minutes.
3. This keeps the bot awake during active hours.

> **Note**: The free tier has limitations. For production use, consider upgrading or using Railway/Render.

## Troubleshooting
- **Bot not responding?** Check the Console tab for errors.
- **Commands not appearing?** Make sure you ran `npm run deploy`.
- **Environment variables missing?** Double-check the Secrets tab.
