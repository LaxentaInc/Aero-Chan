import antiPermissionAbuse from "../modules/APA";
export default {
  name: 'roleCreate',
  once: false,
  async execute(role: any) {
    try {
      await antiPermissionAbuse.handleRoleCreate(role);
    } catch (error: any) {
      console.error('[Event: roleCreate] Error in anti-permission-abuse:', error);
    }
  }
};