import { Message } from "discord.js";
import { GuildId, UserId } from "../../../types/antiraid";

/**
 * User activity tracking and cleanup functions
 */

/**
 * Get or create user activity record
 */
function getUserActivity(userActivity: any, guildId: GuildId, userId: UserId) {
  const key = `${guildId}-${userId}`;
  let activity = userActivity.get(key);
  if (!activity) {
    activity = {
      messages: [],
      strikes: 0,
      lastViolation: 0
    };
    userActivity.set(key, activity);
  }
  return activity;
}

/**
 * Track a message for the user
 */
function trackMessage(userActivity: any, guildId: GuildId, userId: UserId, message: Message & { webhookId?: string }, config: any) {
  const activity = getUserActivity(userActivity, guildId, userId);
  const now = Date.now();
  activity.messages.push({
    messageId: message.id,
    timestamp: now,
    hasImage: message.attachments.size > 0,
    isWebhook: !!message.webhookId,
    channelId: message.channel.id
  });

  // Aggressive cleanup: only keep last 30 seconds worth
  activity.messages = activity.messages.filter((msg: any) => now - msg.timestamp < 30000);
  
  const key = `${guildId}-${userId}`;
  const strikeExpiry = config.strikeExpiry || 300;
  userActivity.set(key, activity, strikeExpiry); // Update TTL dynamically
}

/**
 * Cleanup old data periodically
 */
// Deprecated: NodeCache handles this internally

/**
 * Reset user strikes
 */
function resetUserStrikes(userActivity: any, punishmentLocks: any, guildId: GuildId, userId: UserId) {
  const activity = getUserActivity(userActivity, guildId, userId);
  activity.strikes = 0;
  activity.lastViolation = 0;
  userActivity.set(`${guildId}-${userId}`, activity);
  
  const lockKey = `${guildId}:${userId}`;
  punishmentLocks.del(lockKey);
  console.log(`[SpamProtection] Reset strikes for user ${userId}`);
  return true;
}

/**
 * Get user strike info
 */
function getUserStrikes(userActivity: any, punishmentLocks: any, guildId: GuildId, userId: UserId) {
  const activity = getUserActivity(userActivity, guildId, userId);
  const lockKey = `${guildId}:${userId}`;
  const isLocked = punishmentLocks.has(lockKey);
  return {
    strikes: activity.strikes,
    lastViolation: activity.lastViolation,
    recentMessages: activity.messages.length,
    isLocked,
    lockExpires: isLocked ? new Date(punishmentLocks.get(lockKey) + 5000) : null
  };
}

/**
 * Clear cache for all users
 */
function clearCache(userActivity: any) {
  userActivity.flushAll();
}
export { getUserActivity, trackMessage, resetUserStrikes, getUserStrikes, clearCache };
export default {
  getUserActivity,
  trackMessage,
  resetUserStrikes,
  getUserStrikes,
  clearCache
};
