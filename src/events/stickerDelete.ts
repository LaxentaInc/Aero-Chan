import antiNuke from "../modules/AntiNuke";
export default {
  name: 'stickerDelete',
  async execute(sticker: any, client: any) {
    try {
      if (!sticker.guild) return;
      console.log(`[ANTI-NUKE] Sticker deleted: ${sticker.name} in ${sticker.guild.name}`);
      await antiNuke.handleStickerDelete(sticker);
    } catch (error: any) {
      console.error('[ANTI-NUKE] Error in stickerDelete event:', error.message);
    }
  }
};