import { MongoClient, Db, Collection, Document } from 'mongodb';
import 'dotenv/config';

// const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)!;
if (uri === undefined) {
    throw new Error('[CloudDB] MONGODB_URI or MONGO_URI must be set in environment');
}

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

async function getClient(): Promise<MongoClient> {
    if (client !== null) return client;
    if (connectPromise !== null) return connectPromise;

    connectPromise = (async (): Promise<MongoClient> => {
        try {
            const newClient = new MongoClient(uri, {
                maxPoolSize: 15,
                serverSelectionTimeoutMS: 5000,
            });
            await newClient.connect();
            client = newClient;
            console.log('[CloudDB] shared mongodb connection established');
            return client;
        } catch (error) {
            client = null;
            connectPromise = null;
            console.error('[CloudDB] mongodb connection failed:', error instanceof Error ? error.message : error);
            throw error;
        }
    })();

    return connectPromise;
}

async function getDb(dbName?: string): Promise<Db> {
    const c = await getClient();
    return dbName !== undefined ? c.db(dbName) : c.db();
}

async function getCollection<T extends Document = Document>(
    collectionName: string,
    dbName?: string
): Promise<Collection<T>> {
    const db = await getDb(dbName);
    return db.collection<T>(collectionName);
}

async function closeConnection(): Promise<void> {
    if (client !== null) {
        await client.close();
        client = null;
        connectPromise = null;
        console.log('[CloudDB] shared connection closed');
    }
}

export { getClient, getDb, getCollection, closeConnection };