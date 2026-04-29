import { getCollection } from "../../../utils/CloudDB";
import { buildTrustedSets } from "./config";
/**
 * initialize mongodb — returns the shared collection handle
 * uses db 'antiraid', collection 'spam_protection_config'
 */
async function initDB() {
  try {
    const collection = await getCollection('spam_protection_config', 'antiraid');
    console.log(`[SpamProtection] ✅ connected to MongoDB (shared pool)`);
    return {
      collection
    };
  } catch (error: any) {
    console.error(`[SpamProtection] ❌ MongoDB connection failed:`, error.message);
    return {
      collection: null
    };
  }
}

/**
 * sync configurations from MongoDB
 */
async function syncConfigs(collection: any, configs: any, configLastRefresh: any, trustedUsersSets: any, trustedRolesSets: any) {
  if (!collection) return;
  try {
    const dbConfigs = await (collection.find({}) as any).toArray();
    const defaults = require('./config').getDefaultConfig();
    for (const dbConfig of dbConfigs) {
      const guildId = dbConfig.guildId;
      const cachedConfig = configs.get(guildId) as any;

      // merge with defaults to handle corrupted/partial db entries
      const fullConfig = {
        ...defaults,
        ...(dbConfig.config || {})
      };

      // only update if changed
      if (!cachedConfig || JSON.stringify(cachedConfig) !== JSON.stringify(fullConfig)) {
        configs.set(guildId, fullConfig);
        buildTrustedSets(guildId, fullConfig, trustedUsersSets, trustedRolesSets);
        configLastRefresh.set(guildId, Date.now());
      }
    }
  } catch (error: any) {
    console.error(`[SpamProtection] ❌ config sync failed:`, error.message);
  }
}

/**
 * refresh config for a specific guild (on demand)
 */
async function refreshConfig(collection: any, guildId: any, configs: any, configLastRefresh: any, trustedUsersSets: any, trustedRolesSets: any) {
  if (!collection) return;
  try {
    const doc = await (collection.findOne({
      guildId
    }) as any);
    const defaults = require('./config').getDefaultConfig();
    const fullConfig = {
      ...defaults,
      ...(doc?.config || {})
    };
    configs.set(guildId, fullConfig);
    buildTrustedSets(guildId, fullConfig, trustedUsersSets, trustedRolesSets);
    configLastRefresh.set(guildId, Date.now());
  } catch (err: any) {
    console.error(`[SpamProtection] config refresh failed for ${guildId}:`, err.message);
  }
}

/**
 * update config in MongoDB
 */
async function updateConfig(collection: any, guildId: any, newConfig: any, configs: any, configLastRefresh: any, trustedUsersSets: any, trustedRolesSets: any) {
  if (!collection) return false;
  try {
    let currentConfig = configs.get(guildId) as any;
    const defaults = require('./config').getDefaultConfig();
    if (!currentConfig) {
      const doc = await (collection.findOne({
        guildId
      }) as any);
      currentConfig = doc?.config || defaults;
    }

    // merge defaults -> current -> updates
    const finalConfig = {
      ...defaults,
      ...currentConfig,
      ...newConfig
    };
    await collection.updateOne({
      guildId
    }, {
      $set: {
        guildId,
        config: finalConfig,
        lastUpdated: new Date()
      }
    }, {
      upsert: true
    });
    configs.set(guildId, finalConfig);
    buildTrustedSets(guildId, finalConfig, trustedUsersSets, trustedRolesSets);
    configLastRefresh.set(guildId, Date.now());
    return true;
  } catch (error: any) {
    console.error(`[SpamProtection] ❌ failed to update config:`, error.message);
    return false;
  }
}
export { initDB, syncConfigs, refreshConfig, updateConfig };
export default {
  initDB,
  syncConfigs,
  refreshConfig,
  updateConfig
};