import { getDefaultConfig } from "./config";
import { initMongoDB, syncConfigs, updateConfig } from "./database";
import { findExecutor, isTrusted, getThreshold, canPunish } from "./detection";
import { trackDeletion, trackAction, getActionCount, cleanupOldActions, clearDeletions, trackRoleDeletion } from "./tracking";
import { stripDangerousRoles, executePunishment } from "./punishment";
import { batchRestoreChannels, backupGuild, backupAllGuilds } from "./restoration";
import { notifyOwner, logToChannel } from "./notification";
import { registerStoredButtons } from "./buttons";
import logManager from "../logManager";
/**
 * AntiNuke Module - Main Orchestrator
 * 
 * FIXED ARCHITECTURE:
 * 1. ALWAYS TRACK FIRST - Never skip tracking, even if responding
 * 2. GUILD-LEVEL LOCK - Prevents duplicate punishment, NOT duplicate tracking
 * 3. BATCH PROCESSING - Wait for raid to finish, then restore all
 */

class AntiNuke {
  client: any;
  db: any;
  collection: any;
  configs: Map<any, any>;
  recentActions: Map<any, any>;
  deletedChannels: Map<any, any>;
  deletedRoles: Map<any, any>;
  guildUnderAttack: Set<any>;
  auditLogRequests: Map<any, any>;
  executorCache: Map<any, any>;
  backups: Map<any, any>;
  restoreTimers: Map<any, any>;
  notifiedAttacks: Map<any, any>;
  stats: Record<string, any>;
  constructor(client = null) {
    this.client = client;
    this.db = null;
    this.collection = null;
    this.configs = new Map();

    // Track recent actions: guildId -> userId -> [{ type, timestamp }]
    this.recentActions = new Map();

    // Track deleted channels for batch restoration: guildId -> [channel data]
    this.deletedChannels = new Map();

    // Track deleted roles for batch restoration: guildId -> [role data]
    this.deletedRoles = new Map();

    // FIXED: Guild-level lock (NOT per-user debounce)
    // This prevents duplicate punishment, but ALLOWS tracking to continue
    this.guildUnderAttack = new Set();

    // Performance: Coalesce audit log requests
    this.auditLogRequests = new Map();

    // Performance: Cache recent executors
    this.executorCache = new Map();

    // Simple backups: guildId -> { channels: [], roles: [] }
    this.backups = new Map();

    // Restore timers: guildId -> setTimeout ID
    this.restoreTimers = new Map();

    // FIXED: Track notified attacks to prevent owner DM spam
    // guildId-executorId -> timestamp of last notification
    this.notifiedAttacks = new Map();

    // Stats
    this.stats = {
      bans: 0,
      punishments: 0,
      restorations: 0
    };
    this.init();
  }
  async init() {
    const {
      collection
    } = await initMongoDB();
    this.collection = collection;
    if (collection) {
      await syncConfigs(collection, this.configs);
    }
    this.startCleanupTimer();
    this.startBackupTimer();

    // Buttons are registered in setClient
  }

  // ========================================
  // CONFIG MANAGEMENT
  // ========================================

  getConfig(guildId: any) {
    const cached = this.configs.get(guildId) as any;
    const defaults = getDefaultConfig();

    // Always merge with defaults to self-heal corrupted configs
    return cached ? {
      ...defaults,
      ...cached
    } : defaults;
  }
  async updateConfig(guildId: any, newConfig: any) {
    return await updateConfig(this.collection, this.configs, guildId, newConfig);
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================

  handleChannelDelete(channel: any) {
    if (!channel.guild) return;
    this.processEvent(channel.guild, 'CHANNEL_DELETE', channel);
  }
  handleChannelCreate(channel: any) {
    if (!channel.guild) return;
    this.processEvent(channel.guild, 'CHANNEL_CREATE', channel);
    this.scheduleBackup(channel.guild);
  }
  handleChannelUpdate(oldCh: any, newCh: any) {
    if (!newCh.guild) return;
    this.scheduleBackup(newCh.guild);
  }
  handleRoleDelete(role: any) {
    this.processEvent(role.guild, 'ROLE_DELETE', role);
  }
  handleEmojiDelete(emoji: any) {
    this.processEvent(emoji.guild, 'EMOJI_DELETE', emoji);
  }
  handleWebhookCreate(webhook: any) {
    if (!webhook.guild) return;
    this.processEvent(webhook.guild, 'WEBHOOK_CREATE', webhook);
  }
  handleWebhookUpdate(webhookOrChannel: any) {
    const guild = webhookOrChannel.guild;
    if (!guild) return;
    // FIXED: Only process once, not twice
    this.processEvent(guild, 'WEBHOOK_UPDATE', webhookOrChannel);
  }

  // ========================================
  // MAIN EVENT PROCESSING (FIXED FLOW)
  // ========================================

  async processEvent(guild: any, eventType: any, target: any) {
    const config = this.getConfig(guild.id);
    if (!config.enabled) return;

    // =============================================
    // STEP 1: ALWAYS TRACK DELETION QUEUE (NEVER SKIP!)
    // This saves data for batch restoration
    // =============================================
    if (eventType === 'CHANNEL_DELETE') {
      trackDeletion(this.deletedChannels, guild.id, target);
    } else if (eventType === 'ROLE_DELETE') {
      trackRoleDeletion(this.deletedRoles, guild.id, target);
    }

    // =============================================
    // STEP 2: FIND EXECUTOR (Before lock check!)
    // We need to know WHO did this to count their actions
    // =============================================
    let executor = await findExecutor(guild, eventType, target, this);

    // Retry on audit log lag during mass deletions
    const deletedCount = ((this.deletedChannels.get(guild.id) as any)?.length || 0) + ((this.deletedRoles.get(guild.id) as any)?.length || 0);
    if (!executor && deletedCount > 1) {
      await new Promise((r: any) => setTimeout(r, 1500));
      executor = await findExecutor(guild, eventType, target, this);
    }
    if (!executor) return;

    // =============================================
    // STEP 2.5: LOG ALL EVENTS TO CENTRALIZED LOG CHANNEL
    // This logs EVERY event before any skips/checks
    // =============================================
    logManager.log(guild, eventType, {
      target,
      executor,
      fields: [{
        name: '📊 Event Type',
        value: eventType.replace('_', ' '),
        inline: true
      }, {
        name: '🎯 Target',
        value: target.name || target.id || 'Unknown',
        inline: true
      }]
    });

    // If user/bot is dynamically whitelisted, skip punishment but send a compact notice
    const isWhitelistedExecutor = executor.bot ? config.whitelistedBots?.includes(executor.id) : config.whitelistedUsers?.includes(executor.id);
    if (isWhitelistedExecutor) {
      trackAction(this.recentActions, guild.id, executor.id, eventType);
      const totalCount = getActionCount(this.recentActions, guild.id, executor.id);
      try {
        notifyOwner(guild, executor, executor.bot ? 'bot' : 'user', config, totalCount, eventType, {
          whitelisted: true
        });
        logToChannel(guild, executor, executor.bot ? 'bot' : 'user', config, totalCount, eventType, {
          whitelisted: true
        });
      } catch (e: any) {
        console.error('[AntiNuke] Failed to send whitelisted notice:', e);
      }
      return;
    }
    if (isTrusted(executor, guild, config)) return;
    if (executor.id === this.client?.user?.id) return;

    // =============================================
    // STEP 3: TRACK ACTION COUNT (Before lock check!)
    // This ensures ALL deletions are counted, not just first 2
    // =============================================
    trackAction(this.recentActions, guild.id, executor.id, eventType);

    // =============================================
    // STEP 4: CHECK GUILD-LEVEL LOCK
    // If we're already punishing this guild, exit
    // BUT tracking of both deletion AND action already happened!
    // =============================================
    if (this.guildUnderAttack.has(guild.id)) {
      // Already handling - tracking done, exit
      return;
    }

    // =============================================
    // STEP 5: CHECK THRESHOLD
    // =============================================
    const count = getActionCount(this.recentActions, guild.id, executor.id);
    const threshold = getThreshold(eventType, config, executor.bot);
    const thresholdExceeded = count >= threshold;
    if (thresholdExceeded) {
      console.log(`[AntiNuke] ⚠️ THRESHOLD: ${executor.username} (${count}/${threshold}) [${executor.bot ? 'BOT' : 'USER'}]`);

      // =============================================
      // STEP 6: LOCK GUILD (Prevent duplicate punishment)
      // =============================================
      this.guildUnderAttack.add(guild.id);
      setTimeout(() => this.guildUnderAttack.delete(guild.id), 60000);

      // =============================================
      // STEP 7: EMERGENCY RESPONSE
      // Order matters: STRIP FIRST (fastest), then punish
      // =============================================
      const punishType = executor.bot ? 'bot' : 'user';

      // 1. STRIP ROLES IMMEDIATELY
      const stripResult = await stripDangerousRoles(guild, executor);
      if (stripResult.success && stripResult.removedCount > 0) {
        this.stats.punishments++;
        // Log to centralized log channel
        logManager.log(guild, 'ROLES_STRIPPED', {
          target: executor,
          fields: [{
            name: '🎭 Roles Removed',
            value: `${stripResult.removedCount} dangerous roles`,
            inline: true
          }, {
            name: '📋 Reason',
            value: 'Exceeded destructive action threshold',
            inline: true
          }]
        });
      }

      // 2. EXECUTE PUNISHMENT (if user and strip succeeded)
      if (!executor.bot && stripResult.success) {
        const punishResult = await executePunishment(guild, executor, punishType, config);
        // Log punishment to centralized log
        logManager.log(guild, punishType === 'bot' ? 'USER_PUNISHED' : 'USER_PUNISHED', {
          target: executor,
          fields: [{
            name: '⚡ Action',
            value: config.userAction || 'timeout',
            inline: true
          }, {
            name: '📋 Reason',
            value: `${count} destructive actions in ${config.timeWindow || 30}s`,
            inline: true
          }]
        });
      }

      // 3. NOTIFY (with spam protection)
      const notifyKey = `${guild.id}-${executor.id}`;
      const lastNotify = this.notifiedAttacks.get(notifyKey) as any || 0;
      if (Date.now() - lastNotify > 60000) {
        this.notifiedAttacks.set(notifyKey, Date.now());
        // Pass the FULL count from tracking (includes all 21 deletions)
        const totalCount = getActionCount(this.recentActions, guild.id, executor.id);
        notifyOwner(guild, executor, punishType, config, totalCount, eventType);
        logToChannel(guild, executor, punishType, config, totalCount, eventType);
      }

      // 4. SCHEDULE BATCH RESTORE (4s delay to catch all deletions)
      if (config.tryRestore) {
        this.scheduleRestore(guild, 4000);
      }
    }
  }

  // ========================================
  // RESTORATION
  // ========================================

  scheduleRestore(guild: any, delayMs: number = 4000) {
    const restoreKey = guild.id;

    // Clear existing timer (debounce)
    if (this.restoreTimers.has(restoreKey)) {
      clearTimeout(this.restoreTimers.get(restoreKey) as any);
    }
    const timer = setTimeout(async () => {
      const result = await batchRestoreChannels(guild, this.deletedChannels, this.deletedRoles, this.backups);
      this.stats.restorations += result.restored || 0;
      this.restoreTimers.delete(restoreKey);
    }, delayMs);
    this.restoreTimers.set(restoreKey, timer);
  }

  // ========================================
  // BACKUP MANAGEMENT
  // ========================================

  scheduleBackup(guild: any) {
    // FIXED: Use separate set for backup debounce (was re-using guildUnderAttack incorrectly)
    const key = `backup-${guild.id}`;
    if (this.restoreTimers.has(key)) return; // Use restoreTimers for backup debounce

    const timer = setTimeout(async () => {
      await backupGuild(guild, this.backups);
      this.restoreTimers.delete(key);
    }, 10000);
    this.restoreTimers.set(key, timer);
  }
  async backupAllGuilds() {
    return await backupAllGuilds(this.client, this.backups, this.getConfig.bind(this));
  }

  // ========================================
  // TIMERS & CLEANUP
  // ========================================

  startCleanupTimer() {
    setInterval(() => {
      cleanupOldActions(this.recentActions);

      // FIXED: Cleanup old deletion tracking (prevent memory leak)
      this.cleanupDeletionTracking();

      // FIXED: Cleanup old notification tracking
      this.cleanupNotificationTracking();
    }, 60000);
  }
  cleanupDeletionTracking() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    // Cleanup channel deletions
    for (const [guildId, deletions] of this.deletedChannels.entries()) {
      const recent = deletions.filter((d: any) => now - d.timestamp < maxAge);
      if (recent.length === 0) {
        this.deletedChannels.delete(guildId);
      } else {
        this.deletedChannels.set(guildId, recent);
      }
    }

    // Cleanup role deletions
    for (const [guildId, deletions] of this.deletedRoles.entries()) {
      const recent = deletions.filter((d: any) => now - d.timestamp < maxAge);
      if (recent.length === 0) {
        this.deletedRoles.delete(guildId);
      } else {
        this.deletedRoles.set(guildId, recent);
      }
    }
  }
  cleanupNotificationTracking() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, timestamp] of this.notifiedAttacks.entries()) {
      if (now - timestamp > maxAge) {
        this.notifiedAttacks.delete(key);
      }
    }
  }
  startBackupTimer() {
    setTimeout(() => this.backupAllGuilds(), 5000);
    setInterval(() => this.backupAllGuilds(), 3600000);
  }

  // ========================================
  // API (For commands/dashboard)
  // ========================================

  getStatus(guildId: any) {
    const config = this.getConfig(guildId);
    const tracked = (this.recentActions.get(guildId) as any)?.size || 0;
    const backup = this.backups.get(guildId) as any;
    return {
      enabled: config.enabled,
      trackedUsers: tracked,
      backupChannels: backup?.channels.length || 0,
      backupRoles: backup?.roles.length || 0,
      underAttack: this.guildUnderAttack.has(guildId),
      pendingChannelRestores: (this.deletedChannels.get(guildId) as any)?.length || 0,
      pendingRoleRestores: (this.deletedRoles.get(guildId) as any)?.length || 0,
      stats: this.stats
    };
  }
  resetUser(guildId: any, userId: any) {
    (this.recentActions.get(guildId) as any)?.delete(userId);
  }
  setClient(client: any) {
    this.client = client;
    console.log('[AntiNuke] Client connected');

    // Restore any persisted AntiNuke buttons on startup
    registerStoredButtons(client).catch((err: any) => console.error('[AntiNuke] Failed to restore button handlers:', err));
  }
}
export default AntiNuke;