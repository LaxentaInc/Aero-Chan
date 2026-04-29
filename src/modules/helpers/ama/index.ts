import { getDefaultConfig } from "./config";
import { initMongoDB, syncConfigs, createDefaultConfig, updateConfig } from "./database";
import { cleanupOldActions } from "./tracking";
import { handleModeratorAction, trackAction, handleMassActionViolation, isTrustedUser } from "./detection";
import { executePunishment, stripDangerousRoles } from "./punishment";
import { notifyAndLog } from "./notification";
import logManager from "../logManager";
/**
 * Mass Action Protection Module (AMA)
 * Modularized version
 */

class MassActionProtectionModule {
  moduleName: string;
  configs: Map<any, any>;
  actionTracking: Map<any, any>;
  processingViolations: Set<any>;
  mongoClient: any;
  db: any;
  collection: any;
  client: any;
  syncInterval: any;
  cleanupInterval: any;
  constructor(discordClient = null) {
    this.moduleName = 'mass-action-protection';
    this.configs = new Map(); // guildId -> config cache
    this.actionTracking = new Map(); // guildId -> Map(userId -> actions[])
    this.processingViolations = new Set(); // Globally track users being punished to prevent spam (Debounce)
    this.mongoClient = null;
    this.db = null;
    this.collection = null;
    this.client = discordClient;

    // Sync configs every 10 seconds
    this.syncInterval = setInterval(() => this.syncConfigs(), 60000);

    // Clean old action tracking every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupOldActions(), 300000);

    // Initialize MongoDB connection
    this.initMongoDB();
    console.log(`[${this.moduleName}] Module initialized`);
  }
  setClient(client: any) {
    this.client = client;
    console.log(`[${this.moduleName}] Discord client reference set`);

    // Initialize persistent buttons
    try {
      const buttons = require('./buttons');
      buttons.init(client);
    } catch (err: any) {
      console.error(`[${this.moduleName}] Failed to initialize buttons:`, err);
    }
  }

  /**
   * Init MongoDB connection
   */
  async initMongoDB() {
    const {
      mongoClient,
      db,
      collection
    } = await initMongoDB();
    this.mongoClient = mongoClient;
    this.db = db;
    this.collection = collection;

    // Initial config sync
    await this.syncConfigs();
  }

  /**
   * Sync configurations from MongoDB
   */
  async syncConfigs() {
    await syncConfigs(this.collection, this.configs);
  }

  /**
   * Get configuration for a guild (with defaults)
   */
  getConfig(guildId: any) {
    const cached = this.configs.get(guildId) as any;
    const defaults = getDefaultConfig();

    // Always merge with defaults to self-heal corrupted configs
    return cached ? {
      ...defaults,
      ...cached
    } : defaults;
  }

  /**
   * Handle member removal (kick detection)
   */
  async handleMemberRemove(member: any) {
    await this.handleModeratorAction(member.guild, 'MEMBER_KICK', member);
  }

  /**
   * Handle ban addition
   */
  async handleBanAdd(ban: any) {
    await this.handleModeratorAction(ban.guild, 'MEMBER_BAN_ADD', ban.user);
  }

  /**
   * Handle moderator actions (kick/ban)
   */
  async handleModeratorAction(guild: any, actionType: any, targetUser: any) {
    const context = {
      getConfig: (gid: any) => this.getConfig(gid),
      trackAction: (gid: any, eid: any, at: any, tu: any, cfg: any) => this.trackAction(gid, eid, at, tu, cfg),
      moduleName: this.moduleName
    };
    await handleModeratorAction(guild, actionType, targetUser, context);
  }

  /**
   * Track and analyze moderator actions
   */
  /**
   * Track and analyze moderator actions
   */
  async trackAction(guildId: any, executorId: any, actionType: any, targetUser: any, config: any) {
    const context = {
      actionTracking: this.actionTracking,
      processingViolations: this.processingViolations,
      handleMassActionViolation: (gid: any, eid: any, vd: any, cfg: any) => this.handleMassActionViolation(gid, eid, vd, cfg),
      moduleName: this.moduleName
    };
    await trackAction(guildId, executorId, actionType, targetUser, config, context);
  }

  /**
   * Handle mass action violation
   */
  async handleMassActionViolation(guildId: any, executorId: any, violationData: any, config: any) {
    const context = {
      getGuildById: (gid: any) => this.getGuildById(gid),
      actionTracking: this.actionTracking,
      processingViolations: this.processingViolations,
      moduleName: this.moduleName,
      stripDangerousRoles: (m: any, g: any) => stripDangerousRoles(m, g) // Pass strip function
    };
    await handleMassActionViolation(guildId, executorId, violationData, config, context);
  }

  /**
   * Execute punishment action on violator
   */
  async executePunishment(member: any, guild: any, action: any, config: any) {
    return await executePunishment(member, guild, action, config);
  }

  /**
   * Notify server owner about violation
   */
  /**
   * Unified notification
   */
  async notifyAndLog(guild: any, violator: any, violationData: any, actionsPerformed: any, config: any) {
    await notifyAndLog(guild, violator, violationData, actionsPerformed, config);
  }

  /**
   * Check if user is trusted (owner or in trusted list)
   */
  isTrustedUser(user: any, guild: any, config: any) {
    return isTrustedUser(user, guild, config);
  }

  /**
   * Clean up old action tracking data
   */
  cleanupOldActions() {
    cleanupOldActions(this.actionTracking, (gid: any) => this.getConfig(gid));
  }

  /**
   * Get guild by ID (helper method)
   */
  async getGuildById(guildId: any) {
    if (!this.client) {
      console.error(`[${this.moduleName}] ❌ Discord client not set! Call setClient(client) first.`);
      return null;
    }
    try {
      return await this.client.guilds.fetch(guildId);
    } catch (error: any) {
      console.error(`[${this.moduleName}] ❌ Failed to fetch guild ${guildId}:`, error.message);
      return null;
    }
  }

  /**
   * Create default config for a guild in MongoDB
   */
  async createDefaultConfig(guildId: any) {
    return await createDefaultConfig(this.collection, this.configs, guildId, getDefaultConfig());
  }

  /**
   * Update config in MongoDB (called from frontend API)
   */
  async updateConfig(guildId: any, newConfig: any) {
    return await updateConfig(this.collection, this.configs, guildId, newConfig);
  }

  /**
   * Get current action tracking stats for a guild
   */
  getTrackingStats(guildId: any) {
    const guildTracking = this.actionTracking.get(guildId) as any;
    if (!guildTracking) return {
      activeUsers: 0,
      totalActions: 0
    };
    let totalActions = 0;
    guildTracking.forEach((userActions: any) => {
      totalActions += userActions.length;
    });
    return {
      activeUsers: guildTracking.size,
      totalActions,
      userBreakdown: Array.from(guildTracking.entries()).map(([userId, actions]) => ({
        userId,
        actionCount: actions.length,
        kicks: actions.filter((a: any) => a.type === 'MEMBER_KICK').length,
        bans: actions.filter((a: any) => a.type === 'MEMBER_BAN_ADD').length
      }))
    };
  }

  /**
   * Get module status for a guild
   */
  getStatus(guildId: any) {
    const config = this.getConfig(guildId);
    const trackingStats = this.getTrackingStats(guildId);
    return {
      moduleName: this.moduleName,
      enabled: config.enabled,
      config,
      trackingStats,
      isConnectedToMongoDB: this.collection !== null,
      hasDiscordClient: this.client !== null,
      lastSync: new Date().toISOString()
    };
  }

  /**
   * Manual enable/disable for testing
   */
  async toggleModule(guildId: any, enabled: any) {
    const currentConfig = this.getConfig(guildId);
    const newConfig = {
      ...currentConfig,
      enabled
    };
    return await this.updateConfig(guildId, newConfig);
  }

  /**
   * Reset tracking for a specific user (admin command)
   */
  resetUserTracking(guildId: any, userId: any) {
    const guildTracking = this.actionTracking.get(guildId) as any;
    if (guildTracking && guildTracking.has(userId)) {
      guildTracking.delete(userId);
      console.log(`[${this.moduleName}] 🔄 Reset tracking for user ${userId} in guild ${guildId}`);
      return true;
    }
    return false;
  }

  /**
   * Get detailed action history for debugging
   */
  getActionHistory(guildId: any, userId = null) {
    const guildTracking = this.actionTracking.get(guildId) as any;
    if (!guildTracking) return [];
    if (userId) {
      return guildTracking.get(userId) as any || [];
    } else {
      const allActions = [];
      guildTracking.forEach((userActions: any, uid: any) => {
        userActions.forEach((action: any) => {
          allActions.push({
            ...action,
            executorId: uid
          });
        });
      });
      return allActions.sort((a: any, b: any) => b.timestamp - a.timestamp);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log(`[${this.moduleName}] 🛑 Shutting down...`);
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.mongoClient) {
      await this.mongoClient.close();
      console.log(`[${this.moduleName}] ✅ MongoDB connection closed`);
    }
  }
}

// Create and export singleton instance
const instance = new MassActionProtectionModule();

// Export both class and singleton instance for flexibility
export default instance; // Default export is the instance
export { instance }; // Explicit instance export