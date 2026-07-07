import { getDefaultConfig, buildTrustedSets, hasAdminPermissions, isWhitelisted } from "./config";
import { ExtendedClient } from "../../../types/client";
import { GuildId, UserId } from "../../../types/antiraid";
import { Message, GuildMember } from "discord.js";
import { checkMessageSpam, checkLinkSpamFast, checkImageSpam, checkWebhookSpam } from "./detection";
import { getUserActivity, trackMessage, resetUserStrikes, getUserStrikes, clearCache } from "./tracking";
import { initDB, refreshConfig, updateConfig, syncConfigs } from "./database";
import { executePunishment } from "./punishment";
import { sendWarnings, notifyPunishment, notifyTrustedSpam } from "./notification";
import logManager from "../logManager";
import NodeCache from "node-cache";

/**
 * AntiSpam System - Main Entry Point
 * Modular spam protection for Laxenta
 */

class SpamProtection {
  client: ExtendedClient | null;
  db: any;
  configs: NodeCache;
  userActivity: NodeCache;
  punishmentLocks: NodeCache;
  recentNotifications: NodeCache;
  strikeCooldowns: NodeCache;
  pendingDeletes: Map<string, Set<string>>;
  deleteTimers: Map<string, NodeJS.Timeout>;
  trustedUsersSets: Map<GuildId, Set<UserId>>;
  trustedRolesSets: Map<GuildId, Set<string>>;
  stats: Record<string, number>;
  linkRegex: RegExp;
  discordInviteRegex: RegExp;
  constructor(client: ExtendedClient | null = null) {
    this.client = client;
    this.db = null;
    this.configs = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // 1 hour

    // Track user activity (TTL handled per entry)
    this.userActivity = new NodeCache({ stdTTL: 300, checkperiod: 30 }); // 5 mins

    // Race condition prevention
    this.punishmentLocks = new NodeCache({ stdTTL: 10, checkperiod: 2 });
    this.recentNotifications = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    this.strikeCooldowns = new NodeCache({ stdTTL: 5, checkperiod: 1 });

    // Batch deletion
    this.pendingDeletes = new Map();
    this.deleteTimers = new Map();

    // Trusted user cache
    this.trustedUsersSets = new Map();
    this.trustedRolesSets = new Map();

    // Stats
    this.stats = {
      messagesDeleted: 0,
      usersWarned: 0,
      usersPunished: 0,
      messagesProcessed: 0,
      trustedUsersBypassed: 0
    };

    // Link detection regex
    this.linkRegex = /(https?:\/\/[^\s]+)/gi;
    this.discordInviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
    this.initDB();
  }

  // Set client (must be called after bot is ready)
  setClient(client: ExtendedClient) {
    this.client = client;
    console.log('[SpamProtection] Client set successfully');

    // Initialize persistent buttons
    try {
      const buttons = require('./buttons');
      buttons.init(client);
    } catch (err: any) {
      console.error('[SpamProtection] Failed to initialize buttons:', err);
    }
  }

  async initDB() {
    const {
      collection
    } = await initDB();
    this.db = collection;
  }

  // Get config (with caching)
  getConfig(guildId: GuildId) {
    let cached = this.configs.get(guildId) as any;
    const defaults = getDefaultConfig();

    if (!cached) {
      cached = defaults;
      this.configs.set(guildId, cached);
      
      if (this.db) {
        this.db.findOne({ guildId }).then((doc: any) => {
          if (doc && doc.config) {
             const fullConfig = { ...defaults, ...doc.config };
             this.configs.set(guildId, fullConfig);
             buildTrustedSets(guildId, fullConfig, this.trustedUsersSets, this.trustedRolesSets);
          }
        }).catch(() => {});
      }
    }

    return { ...defaults, ...cached };
  }

  // Update config
  async updateConfig(guildId: GuildId, config: any) {
    return updateConfig(this.db, guildId, config, this.configs, this.trustedUsersSets, this.trustedRolesSets);
  }

  // Main message handler
  async handleMessage(message: Message & { guild: any, member: GuildMember }) {
    this.stats.messagesProcessed++;

    // Early exits (ignore system messages. Allow bots ONLY if they are webhooks)
    if (!message.guild || message.system) return;
    if (message.author.bot && !message.webhookId) return;
    const config = this.getConfig(message.guild.id);
    if (!config.enabled) return;

    // 1. Ignore Admins/Mods completely
    if (hasAdminPermissions(message.member)) {
      if (config.debug) {
        console.log(`[SpamProtection] Ignoring admin/mod: ${message.author.username}`);
      }
      return;
    }

    // 2. Ignore users with roles HIGHER than or EQUAL to the bot
    if (message.guild.members.me.roles.highest.comparePositionTo(message.member.roles.highest) <= 0) {
      if (config.debug) {
        console.log(`[SpamProtection] Ignoring user > bot role: ${message.author.username}`);
      }
      return;
    }

    // 3. Ignore if bot is missing critical permissions
    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      if (config.debug) {
        console.log(`[SpamProtection] Missing ManageMessages permission, disabling protection.`);
      }
      return;
    }

    // 2. Check if user is whitelisted (Trusted User/Role)
    // If whitelisted, we do NOT return, but set a flag to notify instead of punish
    const isTrusted = isWhitelisted(message.member, message.guild.id, config, this.trustedUsersSets, this.trustedRolesSets);
    if (isTrusted) {
      this.stats.trustedUsersBypassed++;
    }

    // Check if user is currently being punished
    const lockKey = `${message.guild.id}:${message.author.id}`;
    if (this.punishmentLocks.has(lockKey)) {
      const lockTime = this.punishmentLocks.get(lockKey) as number;
      if (Date.now() - lockTime < config.punishmentLockTime) {
        if (config.deleteSpamMessages) {
          this.scheduleDelete(message.channel.id, message.id);
        }
        return;
      } else {
        this.punishmentLocks.del(lockKey);
      }
    }

    // Track message
    trackMessage(this.userActivity, message.guild.id, message.author.id, message as any, config);

    // Run spam checks
    const violations = [];
    if (config.messageSpamEnabled) {
      const msgSpam = checkMessageSpam(this.userActivity, message.guild.id, message.author.id, config);
      if (msgSpam) violations.push({
        type: 'message_spam',
        data: msgSpam
      });
    }
    if (config.linkSpamEnabled) {
      const linkSpam = checkLinkSpamFast(message, config, this.linkRegex);
      if (linkSpam) violations.push({
        type: 'link_spam',
        data: linkSpam
      });
    }
    if (config.imageSpamEnabled && message.attachments.size > 0) {
      const imageSpam = checkImageSpam(message, this.userActivity, config);
      if (imageSpam) violations.push({
        type: 'image_spam',
        data: imageSpam
      });
    }
    if (config.webhookSpamEnabled && message.webhookId) {
      const webhookSpam = checkWebhookSpam(this.userActivity, message.guild.id, message.author.id, config);
      if (webhookSpam) violations.push({
        type: 'webhook_spam',
        data: webhookSpam
      });
    }

    // Handle violations
    if (violations.length > 0) {
      if (isTrusted) {
        await this.handleTrustedViolations(message, violations, config);
      } else {
        await this.handleViolations(message, violations, config);
      }
    }
  }

  // Handle violations
  async handleViolations(message: any, violations: any, config: any) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const lockKey = `${guildId}:${userId}`;

    // Check if already being punished
    if (this.punishmentLocks.has(lockKey)) {
      const lockTime = this.punishmentLocks.get(lockKey) as any;
      if (Date.now() - lockTime < config.punishmentLockTime) {
        if (config.deleteSpamMessages) {
          this.scheduleDelete(message.channel.id, message.id);
        }
        return;
      }
    }

    // Retroactive deletion (clean up spam history)
    if (config.deleteSpamMessages) {
      const activity = getUserActivity(this.userActivity, guildId, userId);

      // Determine deletion strategy
      const linkViolation = violations.find((v: any) => v.type === 'link_spam') as any;
      const isContentViolation = violations.some((v: any) => ['image_spam', 'webhook_spam'].includes(v.type));
      const isMessageSpam = violations.some((v: any) => v.type === 'message_spam');
      if (linkViolation) {
        // LINK SPAM: Content-aware deletion
        // Fetch recent channel messages and delete ALL matching links
        try {
          const detectedLinks = Array.isArray(linkViolation.data.links) ? linkViolation.data.links : [linkViolation.data.links];

          // Fetch last 50 messages from channel
          const recentChannelMessages = await message.channel.messages.fetch({
            limit: 50
          });
          const matchingMessages = [];
          let userMessageCount = 0;
          for (const [msgId, msg] of recentChannelMessages) {
            // Only check messages from this user
            if (msg.author.id !== userId) continue;
            userMessageCount++;

            // Check if message contains any of the detected links
            const msgContent = msg.content.toLowerCase();
            const hasMatchingLink = detectedLinks.some((link: any) => msgContent.includes(link.toLowerCase()));
            if (hasMatchingLink) {
              matchingMessages.push(msgId);
            }
          }
          if (matchingMessages.length > 0) {
            for (const msgId of matchingMessages) {
              this.scheduleDelete(message.channel.id, msgId);
            }
          }
        } catch (err: any) {
          console.error('[SpamProtection] Failed to fetch messages for content-aware deletion:', err.message);
          // Fallback to standard deletion
          this.scheduleDelete(message.channel.id, message.id);
        }
      } else if (isContentViolation) {
        // IMAGE/WEBHOOK SPAM: Delete all recent tracked messages (Nuclear)
        const timeWindow = config.messageTimeWindow * 1000;
        const now = Date.now();
        const recentMessages = activity.messages.filter((m: any) => now - m.timestamp <= timeWindow && m.channelId === message.channel.id).map((m: any) => m.messageId).filter((id: any) => id);
        let messagesToDelete = recentMessages;
        if (!messagesToDelete.includes(message.id)) {
          messagesToDelete.push(message.id);
        }
        if (messagesToDelete.length > 0) {
          if (config.debug) console.log(`[SpamProtection] Retroactive delete: ${messagesToDelete.length} messages (Content violation)`);
          for (const msgId of messagesToDelete) {
            this.scheduleDelete(message.channel.id, msgId);
          }
        }
      } else if (isMessageSpam) {
        // MESSAGE SPAM: Delete all except the last one (Keep 1 context)
        const timeWindow = config.messageTimeWindow * 1000;
        const now = Date.now();
        const recentMessages = activity.messages.filter((m: any) => now - m.timestamp <= timeWindow && m.channelId === message.channel.id).map((m: any) => m.messageId).filter((id: any) => id);
        if (recentMessages.length > 1) {
          const messagesToDelete = recentMessages.slice(0, -1);
          if (config.debug) console.log(`[SpamProtection] Retroactive delete: ${messagesToDelete.length} messages (Rate limit)`);
          for (const msgId of messagesToDelete) {
            this.scheduleDelete(message.channel.id, msgId);
          }
        }
      }
    }
    const activity = getUserActivity(this.userActivity, guildId, userId);

    // Check strike cooldown (prevent rapid accumulation)
    const cooldownKey = `${guildId}:${userId}`;
    const lastStrikeTime = this.strikeCooldowns.get(cooldownKey) as any || 0;
    const cooldownDuration = 3000; // 3 seconds

    if (Date.now() - lastStrikeTime < cooldownDuration) {
      // User is on strike cooldown - delete spam but don't increment strikes
      if (config.debug) {
        console.log(`[SpamProtection] User ${userId} on strike cooldown, skipping increment`);
      }
      return; // Spam already deleted above
    }

    // Increment strikes and record cooldown timestamp
    activity.strikes++;
    activity.lastViolation = Date.now();
    this.strikeCooldowns.set(cooldownKey, Date.now());

    // Execute punishment if max strikes reached
    if (activity.strikes >= config.maxStrikes) {
      this.punishmentLocks.set(lockKey, Date.now());
      activity.strikes = 0;
      activity.lastViolation = 0;
      await executePunishment(message,
      // context
      message.member,
      // target member
      violations, config, this.stats, (ctx: any, tm: any, viols: any, cfg: any) => notifyPunishment(ctx, tm, viols, cfg, this.recentNotifications));
    } else {
      // ⚠️ Apply intermediate punishment (10s timeout)
      const {
        executeWarningTimeout
      } = require('./punishment');
      await executeWarningTimeout(message.member, 'AntiSpam Warning Timeout');

      // Send warnings (capture strike count to avoid race condition)
      const currentStrikes = activity.strikes;
      setImmediate(() => {
        sendWarnings(message, message.member, violations, currentStrikes, config).catch(() => {});
      });
    }
  }

  // Handle violations for Trusted Users (No punishment, just notify)
  async handleTrustedViolations(message: any, violations: any, config: any) {
    // Debounce check is handled inside notifyTrustedSpam for notifications.
    // But we might want to avoid spamming the logs if they are spamming 100 messages/sec.
    // notifyTrustedSpam has a debounce 

    // Directly call notification
    notifyTrustedSpam(message,
    // context
    message.member, violations, config, this.recentNotifications).catch(() => {});
  }

  // Add manual strike (for warn command)
  async addManualStrike(context: any, targetMember: any, reason: any) {
    if (!targetMember) return false;
    const guildId = context.guild.id;
    const userId = targetMember.id;
    const config = this.getConfig(guildId);

    // Check if user is trusted (optional bypass check)
    // if (isTrustedFast(targetMember, guildId, config, this.trustedUsersSets, this.trustedRolesSets)) return false;

    const lockKey = `${guildId}:${userId}`;
    if (this.punishmentLocks.has(lockKey)) {
      // Already being punished
      return {
        success: false,
        reason: 'User is already being punished'
      };
    }
    const activity = getUserActivity(this.userActivity, guildId, userId);
    activity.strikes++;
    activity.lastViolation = Date.now();
    const moderator = context.author || context.user;
    const violations = [{
      type: 'manual_warn',
      data: {
        reason,
        moderator: moderator ? `${moderator.username}` : 'Unknown Admin'
      }
    }];
    if (activity.strikes >= config.maxStrikes) {
      this.punishmentLocks.set(lockKey, Date.now());
      activity.strikes = 0;
      activity.lastViolation = 0;
      await executePunishment(context, targetMember, violations, config, this.stats, (ctx: any, tm: any, viols: any, cfg: any) => notifyPunishment(ctx, tm, viols, cfg, this.recentNotifications));
      return {
        success: true,
        action: 'punished',
        strikes: activity.strikes,
        maxStrikes: config.maxStrikes
      };
    } else {
      setImmediate(() => {
        sendWarnings(context, targetMember, violations, activity.strikes, config).catch(() => {});
      });
      return {
        success: true,
        action: 'warned',
        strikes: activity.strikes,
        maxStrikes: config.maxStrikes
      };
    }
  }

  // Schedule message deletion (batch)
  scheduleDelete(channelId: any, messageId: any) {
    if (!this.pendingDeletes.has(channelId)) {
      this.pendingDeletes.set(channelId, new Set());
    }
    (this.pendingDeletes.get(channelId) as any).add(messageId);

    // Cancel existing timer
    if (this.deleteTimers.has(channelId)) {
      clearTimeout(this.deleteTimers.get(channelId) as any);
    }

    // Schedule batch delete with fixed delay
    this.deleteTimers.set(channelId, setTimeout(() => {
      this.executeBatchDelete(channelId);
    }, 500)); // Fixed 500ms delay
  }

  // Execute batch deletion
  async executeBatchDelete(channelId: string) {
    try {
      const messageIds = this.pendingDeletes.get(channelId) as any;
      if (!messageIds || messageIds.size === 0) return;
      const channel = this.client?.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        console.log('[SpamProtection] ❌ Channel not found for deletion or is not text-based');
        return;
      }
      const textChannel = channel as import('discord.js').TextChannel;
      const idsArray = Array.from(messageIds) as string[];
      console.log(`[SpamProtection] 🗑️ Deleting ${idsArray.length} spam message(s)...`);
      if (idsArray.length === 1) {
        await textChannel.messages.delete(idsArray[0]).catch((err: any) => {
          console.error('[SpamProtection] Failed to delete single message:', err.message);
        });
      } else if (idsArray.length <= 100) {
        await textChannel.bulkDelete(idsArray, true).catch((err: any) => {
          console.error('[SpamProtection] Failed to bulk delete:', err.message);
        });
      } else {
        for (let i = 0; i < idsArray.length; i += 100) {
          const chunk = idsArray.slice(i, i + 100);
          await textChannel.bulkDelete(chunk, true).catch((err: any) => {
            console.error('[SpamProtection] Failed to bulk delete chunk:', err.message);
          });
        }
      }
      this.stats.messagesDeleted += idsArray.length;
      console.log(`[SpamProtection] SUCCESS: Deleted ${idsArray.length} message(s)! Total deleted: ${this.stats.messagesDeleted}`);

      // Log to centralized log channel
      if (textChannel.guild) {
        logManager.log(textChannel.guild, 'MESSAGES_DELETED', {
          description: `Deleted ${idsArray.length} spam message(s)`,
          fields: [{
            name: '📁 Channel',
            value: `#${textChannel.name}`,
            inline: true
          }, {
            name: '🗑️ Messages',
            value: `${idsArray.length} deleted`,
            inline: true
          }, {
            name: '📊 Total Deleted',
            value: `${this.stats.messagesDeleted}`,
            inline: true
          }]
        });
      }
    } catch (err: any) {
      console.error('[SpamProtection] Batch delete failed:', err.message);
    } finally {
      this.pendingDeletes.delete(channelId);
      this.deleteTimers.delete(channelId);
    }
  }

  // Start cleanup timer
  startCleanupTimer() {
    // Deprecated: NodeCache handles this internally
  }

  // Utility methods
  resetUserStrikes(guildId: any, userId: any) {
    return resetUserStrikes(this.userActivity, this.punishmentLocks, guildId, userId);
  }
  getUserStrikes(guildId: any, userId: any) {
    return getUserStrikes(this.userActivity, this.punishmentLocks, guildId, userId);
  }
  clearCache() {
    clearCache(this.userActivity);
  }
  getStats() {
    return {
      ...this.stats,
      maps: {
        activeGuilds: this.configs.keys().length,
        trackedUsers: this.userActivity.keys().length,
        activeLocks: this.punishmentLocks.keys().length,
        pendingDeletes: this.pendingDeletes.size
      },
      ratios: {
        trustedBypassRate: this.stats.trustedUsersBypassed > 0 ? (this.stats.trustedUsersBypassed / this.stats.messagesProcessed * 100).toFixed(2) + '%' : '0%',
        punishmentRate: this.stats.usersWarned > 0 ? (this.stats.usersPunished / this.stats.usersWarned * 100).toFixed(2) + '%' : '0%'
      }
    };
  }
}

// Export singleton instance
const instance = new SpamProtection();
export default instance;