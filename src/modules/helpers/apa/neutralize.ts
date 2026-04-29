import { DANGEROUS_PERMISSIONS, getPermissionName } from "./config";
import { saveRoleNeutralization, loadRoleNeutralization, clearRoleNeutralization } from "./storage";
/**
 * APA (Anti-Permission Abuse) Role Neutralization
 * Role permission modification (separate from user punishment)
 */

/**
 * Remove dangerous permissions from a role
 * Only used for ROLE_CREATE and ROLE_UPDATE, NOT ROLE_ASSIGN
 * 
 * @param {Role} role - The role to neutralize
 * @param {BigInt[]} dangerousPerms - Array of dangerous permission flags to remove
 */
async function neutralizeRole(role: Role, dangerousPerms: BigInt[]) {
  try {
    const guild = role.guild;
    const botMember = guild.members.me;

    // Check if bot can manage this role (hierarchy)
    if (botMember.roles.highest.position <= role.position) {
      console.error(`[APA] ❌ Cannot neutralize role ${role.name} - role hierarchy prevents action`);
      return {
        success: false,
        reason: 'Role hierarchy issue',
        hierarchyIssue: true
      };
    }

    // Store original permissions BEFORE modifying
    const originalPerms = role.permissions.bitfield.toString();

    // Calculate new permissions by removing all dangerous ones
    let newPermissions = role.permissions;
    for (const perm of dangerousPerms) {
      newPermissions = newPermissions.remove(perm);
    }

    // Apply new permissions
    await role.setPermissions(newPermissions, 'APA: Dangerous permissions removed');
    console.log(`[APA] ✅ Neutralized role: ${role.name}`);
    console.log(`[APA] Removed permissions: ${dangerousPerms.map((p: any) => getPermissionName(p)).join(', ')}`);

    // Save for restoration via button
    saveRoleNeutralization(guild.id, role.id, {
      originalPerms,
      removedPerms: dangerousPerms.map((p: any) => p.toString()),
      roleName: role.name
    });
    return {
      success: true,
      removedPerms: dangerousPerms.map((p: any) => getPermissionName(p))
    };
  } catch (err: any) {
    console.error(`[APA] ❌ Failed to neutralize role ${role.name}:`, err.message);
    return {
      success: false,
      reason: err.message
    };
  }
}

/**
 * Restore role to original permissions (button action)
 * 
 * @param {Guild} guild - Discord guild
 * @param {string} roleId - ID of the role to restore
 */
async function restoreRolePermissions(guild: Guild, roleId: string) {
  try {
    const role = guild.roles.cache.get(roleId) as any;
    if (!role) {
      return {
        success: false,
        reason: 'Role no longer exists'
      };
    }
    const snapshot = loadRoleNeutralization(guild.id, roleId);
    if (!snapshot || !snapshot.originalPerms) {
      return {
        success: false,
        reason: 'No stored neutralization data for this role'
      };
    }
    const botMember = guild.members.me;

    // Check hierarchy again
    if (botMember.roles.highest.position <= role.position) {
      return {
        success: false,
        reason: 'Role hierarchy prevents restoration'
      };
    }

    // Restore original permissions
    await role.setPermissions(BigInt(snapshot.originalPerms), 'APA: Permissions restored by owner');
    console.log(`[APA] ✅ Restored permissions for role: ${role.name}`);

    // Clear the snapshot after restoration
    clearRoleNeutralization(guild.id, roleId);
    return {
      success: true,
      roleName: role.name
    };
  } catch (err: any) {
    console.error('[APA] Failed to restore role permissions:', err);
    return {
      success: false,
      reason: err.message
    };
  }
}

/**
 * Check if we can neutralize a role (hierarchy check)
 */
function canNeutralizeRole(guild: any, role: any) {
  const botMember = guild.members.me;
  if (!botMember) return {
    success: false,
    reason: 'Cannot fetch bot member'
  };
  if (botMember.roles.highest.position <= role.position) {
    return {
      success: false,
      reason: `Bot's role (position ${botMember.roles.highest.position}) is not above target role (position ${role.position})`
    };
  }
  return {
    success: true
  };
}
export { neutralizeRole, restoreRolePermissions, canNeutralizeRole };
export default {
  neutralizeRole,
  restoreRolePermissions,
  canNeutralizeRole
};