import antiNuke from "../modules/AntiNuke";
export default {
  name: 'channelCreate',
  async execute(channel: any, client: any) {
    try {
      if (!channel.guild) return;
      console.log(`[ANTI-NUKE] Channel created: ${channel.name} in ${channel.guild.name}`);
      await antiNuke.handleChannelCreate(channel);
    } catch (error: any) {
      console.error('[ANTI-NUKE] Error in channelCreate event:', error.message);
    }
  }
};