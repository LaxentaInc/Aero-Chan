import { getDefaultConfig } from "./config";
import { ExtendedClient } from "../../../types/client";
import { GuildId, UserId } from "../../../types/antiraid";
import { Guild, GuildMember, GuildBan, User } from "discord.js";
import { initMongoDB, syncConfigs, createDefaultConfig, updateConfig } from "./database";
import { cleanupOldActions } from "./tracking";
import { handleModeratorAction, trackAction, handleMassActionViolation, isTrustedUser } from "./detection";
import { executePunishment, stripDangerousRoles } from "./punishment";
import { notifyAndLog } from "./notification";
import logManager from "../logManager";
import NodeCache from "node-cache";
/**
 * Mass Action Protection Module (AMA)
 * Modularized version
 */

class MassActionProtectionModule {
  moduleName: string;
  configs: NodeCache;
  actionTracking: NodeCache;
  processingViolations: Set<string>;
  mongoClient: any;
  db: any;
  collection: any;
  client: ExtendedClient | null;
  
  constructor(discordClient: ExtendedClient | null = null) {
    this.moduleName = 'mass-action-protection';
    this.configs = new NodeCache({ stdTTL: 1800, checkperiod: 300 });
    this.actionTracking = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min
    this.processingViolations = new Set(); // Globally track users being punished to prevent spam (Debounce)
    this.mongoClient = null;
    this.db = null;
    this.collection = null;
    this.client = discordClient;

    // Initialize MongoDB connection
    this.initMongoDB();
    console.log(`[${this.moduleName}] Module initialized`);
  }
  setClient(client: ExtendedClient) {
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
      collection
    } = await initMongoDB();
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
  getConfig(guildId: GuildId) {
    let cached = this.configs.get(guildId) as any;
    const defaults = getDefaultConfig();

    if (!cached) {
      cached = defaults;
      this.configs.set(guildId, cached);
      
      if (this.collection) {
        this.collection.findOne({ guildId }).then((doc: any) => {
          if (doc && doc.config) {
             this.configs.set(guildId, { ...defaults, ...doc.config });
          }
        }).catch(() => {});
      }
    }

    return { ...defaults, ...cached };
  }

  /**
   * Handle member removal (kick detection)
   */
  async handleMemberRemove(member: GuildMember) {
    await this.handleModeratorAction(member.guild, 'MEMBER_KICK', member.user);
  }

  /**
   * Handle ban addition
   */
  async handleBanAdd(ban: GuildBan) {
    await this.handleModeratorAction(ban.guild, 'MEMBER_BAN_ADD', ban.user);
  }

  /**
   * Handle moderator actions (kick/ban)
   */
  async handleModeratorAction(guild: Guild, actionType: string, targetUser: User) {
    const context = {
      getConfig: (gid: GuildId) => this.getConfig(gid),
      trackAction: (gid: GuildId, eid: UserId, at: string, tu: User, cfg: any) => this.trackAction(gid, eid, at, tu, cfg),
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
  async trackAction(guildId: GuildId, executorId: UserId, actionType: string, targetUser: User, config: any) {
    const context = {
      actionTracking: this.actionTracking,
      processingViolations: this.processingViolations,
      handleMassActionViolation: (gid: GuildId, eid: UserId, vd: any, cfg: any) => this.handleMassActionViolation(gid, eid, vd, cfg),
      moduleName: this.moduleName
    };
    await trackAction(guildId, executorId, actionType, targetUser, config, context);
  }

  /**
   * Handle mass action violation
   */
  async handleMassActionViolation(guildId: GuildId, executorId: UserId, violationData: any, config: any) {
    const context = {
      getGuildById: (gid: GuildId) => this.getGuildById(gid),
      actionTracking: this.actionTracking,
      processingViolations: this.processingViolations,
      moduleName: this.moduleName,
      stripDangerousRoles: (m: GuildMember, g: Guild) => stripDangerousRoles(m, g) // Pass strip function
    };
    await handleMassActionViolation(guildId, executorId, violationData, config, context);
  }

  /**
   * Execute punishment action on violator
   */
  async executePunishment(member: GuildMember, guild: Guild, action: string, config: any) {
    return await executePunishment(member, guild, action, config);
  }

  /**
   * Notify server owner about violation
   */
  /**
   * Unified notification
   */
  async notifyAndLog(guild: Guild, violator: User, violationData: any, actionsPerformed: any, config: any) {
    await notifyAndLog(guild, violator, violationData, actionsPerformed, config);
  }

  /**
   * Check if user is trusted (owner or in trusted list)
   */
  isTrustedUser(user: User, guild: Guild, config: any) {
    return isTrustedUser(user, guild, config);
  }

  cleanupOldActions() {
    // Left empty as NodeCache handles cleanup via TTL
  }

  /**
   * Get guild by ID (helper method)
   */
  async getGuildById(guildId: GuildId) {
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
    const prefix = `${guildId}-`;
    const keys = this.actionTracking.keys().filter(k => k.startsWith(prefix));
    
    if (keys.length === 0) return {
      activeUsers: 0,
      totalActions: 0
    };
    
    let totalActions = 0;
    const userBreakdown = keys.map(key => {
      const actions = (this.actionTracking.get(key) as any[]) || [];
      const userId = key.replace(prefix, '');
      totalActions += actions.length;
      return {
        userId,
        actionCount: actions.length,
        kicks: actions.filter((a: any) => a.type === 'MEMBER_KICK').length,
        bans: actions.filter((a: any) => a.type === 'MEMBER_BAN_ADD').length
      };
    });

    return {
      activeUsers: keys.length,
      totalActions,
      userBreakdown
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
      const allActions: any[] = [];
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
    this.configs.close();
    this.actionTracking.close();
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