import AMA from "../modules/AMA";
// AMA module handles ban detection
export default {
  name: 'guildBanAdd',
  async execute(ban: any, client: any) {
    try {
      console.log(`[PROTECTION EVENT] Member banned: ${ban.user.username} in ${ban.guild.name}`);

      // AMA module handles ban detection (AntiNuke removed - it only handles channels/roles/emojis)
      await AMA.handleBanAdd(ban);
    } catch (error: any) {
      console.error('[PROTECTION] Error in guildBanAdd event:', error.message);
    }
  }
};