// @ts-nocheck
import { logger } from "../utils/logger";
import { Client, Guild } from "discord.js";
import { MongoClient } from "mongodb";
// antiraid related module, for index.js, so it gets called on bot ready for syncing, and periodically too
let guildSyncInterval: NodeJS.Timeout | null = null;

/**
 * Sync all guilds to the database
 * @param {import('discord.js').Client} client 
 * @param {import('mongodb').MongoClient} mongoClient 
 */
async function syncAllGuilds(client: Client, mongoClient: MongoClient) {
  try {
    logger.info('Starting full guild sync...');
    const t0 = performance.now();
    const db = mongoClient.db('antiraid');
    const guildsCollection = db.collection('bot_guilds');
    const syncPromises = client.guilds.cache.map(async (guild) => {
      try {
        // Check if bot has required permissions (using native .me property exclusively to avoid rate limit queues)
        const botMember = guild.members.me;
        const hasPermissions = botMember && (botMember.permissions.has('Administrator') || botMember.permissions.has('ManageGuild'));
        return {
          guildId: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          icon: guild.iconURL({
            extension: 'png',
            size: 64
          }),
          memberCount: guild.memberCount || guild.members.cache.size,
          botHasPermissions: hasPermissions,
          botJoinedAt: guild.joinedAt,
          lastUpdated: new Date(),
          features: guild.features || []
        };
      } catch (err: any) {
        logger.warn(`⚠️ Error processing guild ${guild.name}: ${err.message}`);
        return null;
      }
    });

    const results = await Promise.all(syncPromises);
    const guildData = results.filter(g => g !== null);
    
    const t1 = performance.now();
    logger.info(`⏱️ [Sync Trace] Local RAM mapping took ${((t1 - t0) / 1000).toFixed(3)}s`);

    // Bulk upsert all guilds
    if (guildData.length > 0) {
      const bulkOps = guildData.map((guild: any) => ({
        updateOne: {
          filter: {
            guildId: guild.guildId
          },
          update: {
            $set: guild
          },
          upsert: true
        }
      }));
      await guildsCollection.bulkWrite(bulkOps);
    }

    const t2 = performance.now();
    logger.info(`⏱️ [Sync Trace] MongoDB BulkUpsert took ${((t2 - t1) / 1000).toFixed(3)}s`);

    // Remove guilds the bot is no longer in
    const currentGuildIds = Array.from(client.guilds.cache.keys());
    await guildsCollection.deleteMany({
      guildId: {
        $nin: currentGuildIds
      }
    });
    const t3 = performance.now();
    logger.info(`⏱️ [Sync Trace] MongoDB DeleteMany took ${((t3 - t2) / 1000).toFixed(3)}s`);
    logger.info(`✅ Guild sync complete: ${guildData.length} guilds updated`);
  } catch (error: any) {
    logger.error('❌ Error syncing guilds:', error.message);
  }
}

/**
 * Sync a single guild to the database
 * @param {import('discord.js').Guild} guild 
 * @param {import('mongodb').MongoClient} mongoClient 
 */
async function syncSingleGuild(guild: Guild, mongoClient: MongoClient) {
  try {
    const db = mongoClient.db('antiraid');
    const guildsCollection = db.collection('bot_guilds');

    // Check if bot has required permissions (using native .me property)
    const botMember = guild.members.me;
    const hasPermissions = botMember && (botMember.permissions.has('Administrator') || botMember.permissions.has('ManageGuild'));
    const guildDoc = {
      guildId: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      icon: guild.iconURL({
        extension: 'png',
        size: 64
      }),
      memberCount: guild.memberCount || guild.members.cache.size,
      botHasPermissions: hasPermissions,
      botJoinedAt: guild.joinedAt,
      lastUpdated: new Date(),
      features: guild.features || []
    };
    await guildsCollection.updateOne({
      guildId: guild.id
    }, {
      $set: guildDoc
    }, {
      upsert: true
    });
    logger.info(`✅ Synced guild: ${guild.name}`);
  } catch (error: any) {
    logger.error(`❌ Error syncing guild ${guild.name}:`, error.message);
  }
}

/**
 * Remove a guild from the database
 * @param {string} guildId 
 * @param {import('mongodb').MongoClient} mongoClient 
 */
async function removeGuildFromDB(guildId: string, mongoClient: MongoClient) {
  try {
    const db = mongoClient.db('antiraid');
    const guildsCollection = db.collection('bot_guilds');
    await guildsCollection.deleteOne({
      guildId
    });
    logger.info(`✅ Removed guild ${guildId} from database`);
  } catch (error: any) {
    logger.error(`❌ Error removing guild ${guildId}:`, error.message);
  }
}

/**
 * Start periodic guild synchronization
 * @param {import('discord.js').Client} client 
 * @param {import('mongodb').MongoClient} mongoClient 
 */
function startGuildSync(client: Client, mongoClient: MongoClient) {
  // Sync every 2 minutes
  if (guildSyncInterval) clearInterval(guildSyncInterval);
  guildSyncInterval = setInterval(async () => {
    logger.info('⏰ Running scheduled guild sync...');
    await syncAllGuilds(client, mongoClient);
  }, 30 * 60 * 1000);
  logger.info('⏰ Guild sync scheduler started (30min intervals)');
  return guildSyncInterval;
}

/**
 * Stop guild synchronization
 */
function stopGuildSync() {
  if (guildSyncInterval) {
    clearInterval(guildSyncInterval);
    guildSyncInterval = null;
  }
}
export { syncAllGuilds, syncSingleGuild, removeGuildFromDB, startGuildSync, stopGuildSync };
export default {
  syncAllGuilds,
  syncSingleGuild,
  removeGuildFromDB,
  startGuildSync,
  stopGuildSync
};