// wipeEconomy.js
const { MongoClient } = require('mongodb');

async function wipeEconomy() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('botEconomy');
        
        await db.collection('users').deleteMany({});
        await db.collection('marriages').deleteMany({});
        
        console.log('⚠️  All user balances reset. Default: 100,000 ⏣');
    } catch (error) {
        console.error('❌ Wipe failed:', error);
    } finally {
        await client.close();
    }
}

wipeEconomy();