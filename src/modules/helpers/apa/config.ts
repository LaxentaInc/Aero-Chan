
import { PermissionFlagsBits } from "discord.js";
/**
 * APA (Anti-Permission Abuse) Default Configuration
 */

const DANGEROUS_PERMISSIONS = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ManageGuildExpressions];
const DANGEROUS_PERMISSION_NAMES = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ManageWebhooks', 'ManageGuildExpressions'];
const defaultConfig = {
  enabled: true,
  // Trusted users/roles (bypass APA completely)
  trustedUsers: [],
  trustedRoles: [],
  // Dynamic whitelist (managed via buttons)
  whitelistedUsers: [],
  // What counts as dangerous
  dangerousPermissions: DANGEROUS_PERMISSION_NAMES,
  // Monitoring toggles
  monitorRoleCreation: true,
  monitorRoleUpdates: true,
  monitorRoleAssignments: true,
  // Punishment configuration
  punishment: 'timeout',
  // timeout, kick, ban
  timeoutMinutes: 30,
  stripExecutorRoles: true,
  // Bot-specific
  monitorBots: true,
  // Notifications
  notifyOwner: true,
  notifyOnPermissionFailure: true,
  logChannelId: null,
  // Duplicate prevention
  punishmentCooldown: 300,
  // 5 minutes

  // Audit log settings
  auditLogCacheDuration: 2000,
  // 2 seconds
  auditLogTimeout: 5000,
  // Max time to wait for audit logs

  debug: false
};
function getDefaultConfig() {
  return {
    ...defaultConfig
  };
}
function getPermissionName(permBigInt: any) {
  const permMap: Record<string, string> = {
    [String(PermissionFlagsBits.Administrator)]: 'Administrator',
    [String(PermissionFlagsBits.ManageGuild)]: 'Manage Server',
    [String(PermissionFlagsBits.ManageRoles)]: 'Manage Roles',
    [String(PermissionFlagsBits.ManageChannels)]: 'Manage Channels',
    [String(PermissionFlagsBits.BanMembers)]: 'Ban Members',
    [String(PermissionFlagsBits.KickMembers)]: 'Kick Members',
    [String(PermissionFlagsBits.ManageWebhooks)]: 'Manage Webhooks',
    [String(PermissionFlagsBits.ManageGuildExpressions)]: 'Manage Emojis/Stickers'
  };
  return permMap[String(permBigInt)] || 'Unknown Permission';
}
export { getDefaultConfig, defaultConfig, DANGEROUS_PERMISSIONS, DANGEROUS_PERMISSION_NAMES, getPermissionName };
export default {
  getDefaultConfig,
  defaultConfig,
  DANGEROUS_PERMISSIONS,
  DANGEROUS_PERMISSION_NAMES,
  getPermissionName
};
