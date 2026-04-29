import antiNuke from "../modules/AntiNuke";
export default {
  name: 'roleDelete',
  async execute(role: any, client: any) {
    try {
      console.log(`[ANTI-NUKE] Role deleted: ${role.name} in ${role.guild.name}`);
      await antiNuke.handleRoleDelete(role);
    } catch (error: any) {
      console.error('[ANTI-NUKE] Error in roleDelete event:', error.message);
    }
  }
};