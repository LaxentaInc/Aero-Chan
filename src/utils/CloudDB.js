// shared mongodb connection pool — single client for the entire bot
// all modules should use this instead of creating their own MongoClient

const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

let client = null;
let connectPromise = null;

/**
 * get the shared MongoClient instance (lazy-connects on first call)
 * returns the same client every time — one pool for everything
 */
async function getClient() {
  if (client) return client;

  // prevent multiple simultaneous connection attempts
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      client = new MongoClient(uri, {
        maxPoolSize: 15, // enough for all modules to share
        serverSelectionTimeoutMS: 5000,
      });
      await client.connect();
      console.log('[CloudDB] ✅ shared mongodb connection established');
      return client;
    } catch (error) {
      console.error('[CloudDB] ❌ mongodb connection failed:', error.message);
      client = null;
      connectPromise = null;
      throw error;
    }
  })();

  return connectPromise;
}

/**
 * get a database by name (defaults to the default db in the uri)
 */
async function getDb(dbName) {
  const c = await getClient();
  return dbName ? c.db(dbName) : c.db();
}

/**
 * shortcut — get a collection from a specific db
 */
async function getCollection(collectionName, dbName) {
  const db = await getDb(dbName);
  return db.collection(collectionName);
}

/**
 * close the shared connection (call on graceful shutdown)
 */
async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    connectPromise = null;
    console.log('[CloudDB] ✅ shared connection closed');
  }
}

module.exports = {
  getClient,
  getDb,
  getCollection,
  closeConnection
};
