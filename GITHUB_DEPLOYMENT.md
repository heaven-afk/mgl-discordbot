# Quick GitHub Push Guide

## Option 1: Using GitHub Desktop (Easiest)
1. Download [GitHub Desktop](https://desktop.github.com/)
2. Install and sign in with your GitHub account
3. Click **File** → **Add Local Repository**
4. Browse to: `c:\Users\ziono\Documents\MGL 2026 Bot\discord-message-bot`
5. Click **Publish repository**
6. Uncheck "Keep this code private" if you want it public
7. Click **Publish Repository**

Done! Your code is now on GitHub.

---

## Option 2: Using Git Command Line

### Step 1: Configure Git (One-time setup)
```bash
git config --global user.name "Your GitHub Username"
git config --global user.email "your-github-email@example.com"
```

### Step 2: Complete the commit
```bash
cd "c:\Users\ziono\Documents\MGL 2026 Bot\discord-message-bot"
git commit -m "Initial commit: Discord Message Bot"
```

### Step 3: Create repository on GitHub
1. Go to https://github.com/new
2. Repository name: `discord-message-bot`
3. Keep it Public or Private (your choice)
4. **Do NOT** check "Initialize with README"
5. Click **Create repository**

### Step 4: Push to GitHub
GitHub will show you commands. Copy your repository URL and run:
```bash
git remote add origin https://github.com/YOUR_USERNAME/discord-message-bot.git
git branch -M main
git push -u origin main
```

---

## Option 3: Manual Upload via GitHub Web Interface
1. Go to https://github.com/new
2. Create a new repository named `discord-message-bot`
3. After creation, click **uploading an existing file**
4. Drag and drop all files from `c:\Users\ziono\Documents\MGL 2026 Bot\discord-message-bot`
5. **Important:** Do NOT upload `.env` file (contains secrets)
6. Click **Commit changes**

---

**Recommended:** Use **GitHub Desktop** (Option 1) - it's the easiest and handles everything automatically!
