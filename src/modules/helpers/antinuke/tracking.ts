/**
 * AntiNuke Tracking
 * Track deletions and actions for threshold counting
 */

/**
 * Track a deleted channel for batch restoration
 * THIS IS ALWAYS CALLED FIRST - NEVER SKIP
 */
function trackDeletion(deletedChannels: any, guildId: any, target: any) {
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
function trackRoleDeletion(deletedRoles: any, guildId: any, target: any) {
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
function trackAction(recentActions: any, guildId: any, userId: any, eventType: any) {
  if (!recentActions.has(guildId)) {
    recentActions.set(guildId, new Map());
  }
  const guildData = recentActions.get(guildId) as any;
  if (!guildData.has(userId)) {
    guildData.set(userId, []);
  }
  (guildData.get(userId) as any).push({
    type: eventType,
    timestamp: Date.now()
  });
}

/**
 * Get count of recent actions by a user (within 30s window)
 */
function getActionCount(recentActions: any, guildId: any, userId: any, eventType = null) {
  const now = Date.now();
  const actions = (recentActions.get(guildId) as any)?.get(userId) || [];
  return actions.filter((action: any) => {
    const withinWindow = now - action.timestamp < 30000;
    const matchesType = !eventType || action.type === eventType;
    return withinWindow && matchesType;
  }).length;
}

/**
 * Clear action tracking for a user (after punishment)
 */
function clearUserActions(recentActions: any, guildId: any, userId: any) {
  (recentActions.get(guildId) as any)?.delete(userId);
}

/**
 * Clean up old action tracking data (called periodically)
 */
function cleanupOldActions(recentActions: any) {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [guildId, guildData] of recentActions.entries()) {
    for (const [userId, actions] of guildData.entries()) {
      // Keep only actions from last 5 minutes
      const recent = actions.filter((a: any) => now - a.timestamp < 300000);
      if (recent.length === 0) {
        guildData.delete(userId);
        cleanedCount++;
      } else {
        guildData.set(userId, recent);
      }
    }
    if (guildData.size === 0) {
      recentActions.delete(guildId);
    }
  }
  return cleanedCount;
}

/**
 * Clean up old deletion tracking (called after restore)
 */
function clearDeletions(deletedChannels: any, guildId: any) {
  deletedChannels.set(guildId, []);
}
export { trackDeletion, trackRoleDeletion, trackAction, getActionCount, clearUserActions, cleanupOldActions, clearDeletions };
export default {
  trackDeletion,
  trackRoleDeletion,
  trackAction,
  getActionCount,
  clearUserActions,
  cleanupOldActions,
  clearDeletions
};