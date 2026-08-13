import { ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { generateQuoteImage, DEFAULT_STYLE } from "../../handlers/quote/imageGenerator";
import { storeQuote } from "../../handlers/quote/storage";

import { createQuoteComponents } from "../../handlers/quote/QuoteContext";

export default {
  data: new ContextMenuCommandBuilder().setName('Make it a Quote').setType(ApplicationCommandType.Message).setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    const targetMessage = interaction.targetMessage;

    // check if message has content
    if (!targetMessage.content || targetMessage.content.trim().length === 0) {
      return await interaction.reply({
        content: 'This message has no text content to quote.',
        flags: 64
      });
    }

    // check if it's too long
    if (targetMessage.content.length > 500) {
      return await interaction.reply({
        content: 'This message is too long to quote (max 500 characters).',
        flags: 64
      });
    }

    await interaction.deferReply();

    try {
      const style = { ...DEFAULT_STYLE };

      // Clean content: resolves mentions to @names and cleans custom emojis
      let cleanText = targetMessage.cleanContent || targetMessage.content;
      cleanText = cleanText.replace(/<a?:([^:]+):[0-9]+>/g, ':$1:');

      // generate quote image
      const imageBuffer = await generateQuoteImage(cleanText, targetMessage.author, style);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'quote.png' });
      const components = createQuoteComponents(style);

      const sentMessage = await interaction.editReply({
        content: `[Jump to original message](${targetMessage.url})`,
        files: [attachment],
        components: components
      });

      // store quote metadata + content + author data for regeneration
      storeQuote(sentMessage.id, {
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        originalMessageUrl: targetMessage.url,
        originalAuthor: targetMessage.author.id,
        content: cleanText,
        authorData: {
          displayName: targetMessage.author.displayName || targetMessage.author.username,
          username: targetMessage.author.username,
          // ALWAYS force static PNG to prevent @napi-rs/canvas 'unsupported image source' with GIFs
          avatarURL: targetMessage.author.displayAvatarURL({ extension: 'png', forceStatic: true, size: 512 }),
        },
        style: style,
      });

      console.log(`Quote created by ${interaction.user.tag} for message from ${targetMessage.author.tag}`);
    } catch (error: any) {
      console.error('Failed to create quote:', error);
      await interaction.editReply({
        content: 'Failed to create quote image. Please try again.',
        components: []
      });
    }
  }
};