import antiPermissionAbuse from "../modules/APA";
export default {
  name: 'roleUpdate',
  once: false,
  async execute(oldRole: any, newRole: any) {
    try {
      await antiPermissionAbuse.handleRoleUpdate(oldRole, newRole);
    } catch (error: any) {
      console.error('[Event: roleUpdate] Error in anti-permission-abuse:', error);
    }
  }
};