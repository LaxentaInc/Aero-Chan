import AntiPermissionAbuse from "./helpers/apa";
/**
 * APA (Anti-Permission Abuse) Module
 * 
 * This is a thin wrapper that re-exports the modular APA implementation.
 * The actual logic is in ./helpers/apa/
 * 
 * KEY BEHAVIOR:
 * - ROLE_CREATE: Neutralize role + punish untrusted creator
 * - ROLE_UPDATE: Neutralize added perms + punish untrusted editor  
 * - ROLE_ASSIGN: ONLY punish untrusted assigner (don't touch pre-existing roles!)
 * 
 * Interactive buttons in owner DMs:
 * - Whitelist User
 * - Restore User Roles (give back stripped roles)
 * - Restore Role Perms (if role was neutralized)
 * - Unwhitelist / Strip / Kick / Ban (for whitelisted user notifications)
 */

// Create singleton instance
const instance = new AntiPermissionAbuse();

// Export instance as default for backward compatibility
export default instance; // Named exports for flexibility
export { AntiPermissionAbuse };
export { instance }; // Re-export useful helpers for external access
export const getPermissionName = require('./helpers/apa/config').getPermissionName;
export const DANGEROUS_PERMISSIONS = require('./helpers/apa/config').DANGEROUS_PERMISSIONS;