# Smart AI Setup (Simplified)

## ⚡ Super Quick Setup

### Step 1: Install Ollama
- Download: https://ollama.ai/download
- Install and run

### Step 2: Get a Model
```bash
ollama pull mistral
```

### Step 3: Start Ollama
```bash
ollama serve
```

### Step 4: Deploy & Run
```bash
npm run deploy
npm start
```

**That's it!** ✅ Your bot now has AI responses!

---

## 💬 Using the AI

### `/smartreply` Command
```
/smartreply message:Hello AI!
```
Manually get an AI response.

### Auto-Assistant
Enable automatic responses:
```
/smart set enabled:on auto:on
```

The bot will auto-respond when:
- @mentioned
- Replied to
- Specific keywords used

### Configuration
```
/smart set enabled:on auto:off
/smart set cooldown_user:30
/smart triggers mention:on
/smart allow target:#general
```

---

## 🔧 Advanced: Use OpenAI Instead

If you want premium AI (costs money):

1. **Get API Key:** https://platform.openai.com/api-keys
2. **Add to `.env`:**
   ```bash
   OPENAI_API_KEY=sk-your_key_here
   OPENAI_MODEL=gpt-4o-mini
   ```
3. **Restart bot**

The bot will use OpenAI first, fall back to Ollama if unavailable.

---

## ❌ Troubleshooting

**"AI service unavailable"**
- Start Ollama: `ollama serve`
- Check it's running: `ollama list`

**"Ollama not running"**
```bash
ollama serve
```

**Slow responses?**
- First response may be slow (model loading)
- Subsequent responses are faster
- Try a smaller model: `ollama pull phi`

---

## 📊 Cost Comparison

| Option | Cost | Setup | Speed |
|--------|------|-------|-------|
| **Ollama** | FREE | 5 min | Fast |
| **OpenAI** | ~$0.0001/request | 2 min | Faster |

**Recommendation:** Use Ollama (free & unlimited)!
