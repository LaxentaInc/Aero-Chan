import { getQuote, removeQuote } from "./storage";
import { logger } from "../../utils/logger";
import { MessageFlags } from "discord.js";
async function handleQuoteRemoval(interaction: any) {
  const customId = interaction.customId;
  try {
    const parts = customId.split('_');
    const requesterId = parts[2];
    const messageId = parts[3] || interaction.message.id;

    // Check permissions
    const quoteData = getQuote(messageId);
    const isRequester = interaction.user.id === requesterId;
    const isQuotedUser = quoteData && interaction.user.id === quoteData.originalAuthor;
    const isAdmin = interaction.memberPermissions?.has('ManageMessages') || false;
    if (!isRequester && !isQuotedUser && !isAdmin) {
      return await interaction.reply({
        content: 'Only the person who created this quote, the quoted user, or an admin can remove it.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Remove from storage first
    removeQuote(messageId);

    // In guilds, try to delete
    if (interaction.guild) {
      try {
        await interaction.message.delete();
        logger.info(`[Quote] Quote deleted by ${interaction.user.tag}`);
        return;
      } catch (error: any) {
        logger.error(`[Quote] Failed to delete in guild: ${error.message}`);
      }
    }

    // Use interaction.update() with attachments: [] to remove attachments, yes im dumnbb
    try {
      await interaction.update({
        content: `<a:kittycat:1333358006720794624> Removed by ${interaction.user}`,
        embeds: [],
        components: [],
        attachments: [] // This removes all attachments!
      });
      logger.info(`[Quote] Quote removed by ${interaction.user.tag}`);
    } catch (error: any) {
      logger.error(`[Quote] Failed to update message: ${error.message}`);
    }
  } catch (error: any) {
    logger.error(`[Quote] Error handling removal: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `Failed to process request: ${error.message}`,
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
}
export { handleQuoteRemoval };
export default {
  handleQuoteRemoval
};