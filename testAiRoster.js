require('dotenv').config();
const rosterParser = require('./src/services/rosterParser');

const messyMessage = `
our squad: 
Team managers: john doe and jane doe 
org name is Alpha Strikers 
we're playing in tier 2

Player 1
Johnny Appleseed
ign: AppleJohny
123456789
discord: john@apple
I use an iPhone 13 Pro
I'm from America 🇺🇸
male
serial: AAAA-BBBB-CCCC

Player 2 is Sarah Connor. IGN: SarCon. UID: 987654321. discord is sarahc. device samsung s23. region europe. female. s/n: 1111-2222
`;

async function runTest() {
    console.log('Testing Regex Parser:');
    const regexResult = rosterParser.parseMessage(messyMessage);
    console.log(JSON.stringify(regexResult, null, 2));

    console.log('\nTesting AI Parser:');
    const aiResult = await rosterParser.parseMessageWithAI(messyMessage);
    console.log(JSON.stringify(aiResult, null, 2));
}

runTest().catch(console.error);
