import { getCollection } from "../../../utils/CloudDB";
/**
 * AntiNuke Database Management
 * uses shared mongodb connection from CloudDB
 */

/**
 * initialize mongodb — returns the shared collection handle
 */
async function initMongoDB() {
  try {
    const collection = await getCollection('antinuke_config', 'antiraid');
    console.log(`[AntiNuke] connected to MongoDB (shared pool)`);
    return {
      collection
    };
  } catch (error: any) {
    console.error(`[AntiNuke] MongoDB connection failed:`, error.message);
    return {
      collection: null
    };
  }
}

/**
 * sync configurations from MongoDB to cache
 */
async function syncConfigs(collection: any, configs: any) {
  if (!collection) return;
  try {
    const dbConfigs = await (collection.find({}) as any).toArray();
    for (const dbConfig of dbConfigs) {
      configs.set(dbConfig.guildId, dbConfig.config);
    }
  } catch (error: any) {
    console.error(`[AntiNuke] config sync failed:`, error.message);
  }
}

/**
 * update config in MongoDB
 */
async function updateConfig(collection: any, configs: any, guildId: any, newConfig: any) {
  if (!collection) return false;
  try {
    await collection.updateOne({
      guildId
    }, {
      $set: {
        guildId,
        config: newConfig,
        updated: new Date()
      }
    }, {
      upsert: true
    });
    configs.set(guildId, newConfig);
    return true;
  } catch (error: any) {
    console.error(`[AntiNuke] failed to update config:`, error.message);
    return false;
  }
}
export { initMongoDB, syncConfigs, updateConfig };
export default {
  initMongoDB,
  syncConfigs,
  updateConfig
};