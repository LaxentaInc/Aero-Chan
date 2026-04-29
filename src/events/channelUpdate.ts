import antiNuke from "../modules/AntiNuke";
export default {
  name: 'channelUpdate',
  async execute(oldChannel: any, newChannel: any, client: any) {
    try {
      if (!newChannel.guild) return;

      // console.log(`[ANTI-NUKE] Channel updated: ${newChannel.name} in ${newChannel.guild.name}`);
      await antiNuke.handleChannelUpdate(oldChannel, newChannel);
    } catch (error: any) {
      console.error('[ANTI-NUKE] Error in channelUpdate event:', error.message);
    }
  }
};