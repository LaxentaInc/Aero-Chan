import { GuildId, UserId, ActionType } from "../../../types/antiraid";

/**
 * AntiNuke Tracking
 * Track deletions and actions for threshold counting
 */

/**
 * Track a deleted channel for batch restoration
 * THIS IS ALWAYS CALLED FIRST - NEVER SKIP
 */
function trackDeletion(deletedChannels: Map<GuildId, any[]>, guildId: GuildId, target: any) {
  if (!deletedChannels.has(guildId)) {
    deletedChannels.set(guildId, []);
  }
  (deletedChannels.get(guildId) as any).push({
    id: target.id,
    name: target.name,
    type: target.type,
    parentId: target.parentId || null,
    position: target.position,
    timestamp: Date.now()
  });
  console.log(`[AntiNuke] 📝 Tracked channel deletion: ${target.name} (guild: ${guildId})`);
}

/**
 * Track a deleted role for batch restoration
 */
function trackRoleDeletion(deletedRoles: Map<GuildId, any[]>, guildId: GuildId, target: any) {
  if (!deletedRoles.has(guildId)) {
    deletedRoles.set(guildId, []);
  }
  (deletedRoles.get(guildId) as any).push({
    id: target.id,
    name: target.name,
    color: target.color,
    permissions: target.permissions,
    position: target.position,
    hoist: target.hoist,
    mentionable: target.mentionable,
    timestamp: Date.now()
  });
  console.log(`[AntiNuke] 📝 Tracked role deletion: ${target.name} (guild: ${guildId})`);
}

/**
 * Track a user action with timestamp
 */
function trackAction(recentActions: any, guildId: GuildId, userId: UserId, eventType: ActionType) {
  const key = `${guildId}-${userId}`;
  const actions = recentActions.get(key) || [];
  actions.push({
    type: eventType,
    timestamp: Date.now()
  });
  recentActions.set(key, actions);
}

/**
 * Get count of recent actions by a user (within 30s window)
 */
function getActionCount(recentActions: any, guildId: GuildId, userId: UserId, eventType: ActionType | null = null): number {
  const now = Date.now();
  const key = `${guildId}-${userId}`;
  const actions = recentActions.get(key) || [];
  return actions.filter((action: any) => {
    const withinWindow = now - action.timestamp < 30000;
    const matchesType = !eventType || action.type === eventType;
    return withinWindow && matchesType;
  }).length;
}

/**
 * Clear action tracking for a user (after punishment)
 */
function clearUserActions(recentActions: any, guildId: GuildId, userId: UserId) {
  recentActions.del(`${guildId}-${userId}`);
}

/**
 * Clean up old action tracking data (called periodically)
 */
// Deprecated: NodeCache handles this internally

/**
 * Clean up old deletion tracking (called after restore)
 */
function clearDeletions(deletedChannels: Map<GuildId, any[]>, guildId: GuildId) {
  deletedChannels.set(guildId, []);
}
export { trackDeletion, trackRoleDeletion, trackAction, getActionCount, clearUserActions, clearDeletions };
export default {
  trackDeletion,
  trackRoleDeletion,
  trackAction,
  getActionCount,
  clearUserActions,
  clearDeletions
};
