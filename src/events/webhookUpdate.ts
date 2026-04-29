import antiNuke from "../modules/AntiNuke";
export default {
  name: 'webhookUpdate',
  async execute(channel: any, client: any) {
    try {
      if (!channel.guild) return;
      console.log(`[ANTI-NUKE] Webhook update in: ${channel.name} (${channel.guild.name})`);
      await antiNuke.handleWebhookUpdate(channel);
    } catch (error: any) {
      console.error('[ANTI-NUKE] Error in webhookUpdate event:', error.message);
    }
  }
};