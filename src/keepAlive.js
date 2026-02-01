const express = require('express');
const app = express();
const PORT = 3000;

// Simple health check endpoint
app.get('/', (req, res) => {
    res.send('Discord Bot is running!');
});

app.get('/health', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

function keepAlive() {
    app.listen(PORT, () => {
        console.log(`Keep-alive server running on port ${PORT}`);
    });
}

module.exports = keepAlive;
