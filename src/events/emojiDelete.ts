import antiNuke from "../modules/AntiNuke";
export default {
  name: 'emojiDelete',
  async execute(emoji: any, client: any) {
    try {
      console.log(`[ANTI-NUKE] Emoji deleted: ${emoji.name} in ${emoji.guild.name}`);
      await antiNuke.handleEmojiDelete(emoji);
    } catch (error: any) {
      console.error('[ANTI-NUKE] Error in emojiDelete event:', error.message);
    }
  }
};