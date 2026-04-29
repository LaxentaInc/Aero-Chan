/**
 * Configuration Management for Bot Protection
 * Handles default configs and trusted user checks
 */

/**
 * Get default configuration
 */
function getDefaultConfig() {
  return {
    enabled: true,
    minAccountAge: 168,
    // 7 days in hours
    checkUnverified: true,
    trustedUsers: [],
    trustedRoles: [],
    bypassTrusted: true,
    punishmentActions: ['kick_bot', 'remove_roles_adder', 'timeout_adder'],
    timeoutDuration: 3600,
    // 1 hour in seconds
    notifyOwner: true,
    logChannelId: null,
    logActions: true,
    debug: false,
    whitlistedBots: [],
    autoKickBots: true,
    punishAdders: true
  };
}

/**
 * Check if user is trusted (owner, bypass config, or in trusted lists)
 * Trusted users are bypassed and NOT punished even if bot has higher hierarchy
 */
function isTrustedUser(user: any, guild: any, config: any) {
  // Guild owner is ALWAYS trusted
  if (user.id === guild.ownerId) return true;

  // If bypass is disabled, ONLY owner is trusted
  if (!config.bypassTrusted) {
    return false;
  }

  // Check trusted user IDs from config
  if (config.trustedUsers && config.trustedUsers.includes(user.id)) {
    return true;
  }

  // Check if user has any trusted roles from config
  const member = guild.members.cache.get(user.id) as any;
  if (member && config.trustedRoles && config.trustedRoles.length > 0) {
    if (config.trustedRoles.some((roleId: any) => member.roles.cache.has(roleId))) {
      return true;
    }
  }
  return false;
}
export { getDefaultConfig, isTrustedUser };
export default {
  getDefaultConfig,
  isTrustedUser
};