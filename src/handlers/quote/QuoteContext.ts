import { getQuote, removeQuote, updateQuote } from "./storage";
import { generateQuoteImage, convertToGif, TEXT_COLORS } from "./imageGenerator";
import { logger } from "../../utils/logger";
import { MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/**
 * rebuild the button row (same as in the context command)
 */
function createQuoteButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quote_toggle').setLabel('Toggle Quotes').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote_gif').setLabel('GIF').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote_color').setLabel('Color').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quote_bold').setLabel('Bold').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote_italic').setLabel('Italic').setStyle(ButtonStyle.Secondary),
  );
}

/**
 * handle all quote button interactions
 */
async function handleQuoteButton(interaction: any) {
  const customId = interaction.customId;
  const messageId = interaction.message.id;
  const quoteData = getQuote(messageId);

  try {
    // Acknowledge immediately to prevent 'Unknown interaction' timeout
    // Only remove and gif might need different behavior, but deferUpdate is safe for editing the message.
    // For remove, we delete the message or update it, so deferUpdate is fine.
    await interaction.deferUpdate();
  } catch (err: any) {
    logger.error(`[Quote] Failed to defer update: ${err.message}`);
    return;
  }

  if (!quoteData) {
    return await interaction.followUp({
      content: 'This quote has expired or is no longer available.',
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }

  try {
    // --- toggle quotes ---
    if (customId === 'quote_toggle') {
      return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
        style.showQuotes = style.showQuotes === false ? true : false;
      });
    }

    // --- gif ---
    if (customId === 'quote_gif') {
      return await handleGif(interaction, quoteData);
    }

    // --- color cycle ---
    if (customId === 'quote_color') {
      return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
        style.colorIndex = (style.colorIndex + 1) % TEXT_COLORS.length;
      });
    }

    // --- bold toggle ---
    if (customId === 'quote_bold') {
      return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
        style.bold = !style.bold;
      });
    }

    // --- italic toggle ---
    if (customId === 'quote_italic') {
      return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
        style.italic = !style.italic;
      });
    }
  } catch (error: any) {
    logger.error(`[Quote] Button handler error: ${error.message}`);
    await interaction.followUp({
      content: `Something went wrong: ${error.message}`,
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }
}



/**
 * handle gif conversion - replaces original message
 */
async function handleGif(interaction: any, quoteData: any) {
  const authorObj = {
    displayName: quoteData.authorData.displayName,
    username: quoteData.authorData.username,
    avatarURL: quoteData.authorData.avatarURL,
  };

  const pngBuffer = await generateQuoteImage(quoteData.content, authorObj, quoteData.style);
  const gifBuffer = await convertToGif(pngBuffer);
  const attachment = new AttachmentBuilder(gifBuffer, { name: 'quote.gif' });
  const row = createQuoteButtons();

  await interaction.editReply({
    content: `[Jump to original message](${quoteData.originalMessageUrl})`,
    files: [attachment],
    attachments: [],
    components: [row]
  });
}

/**
 * handle style changes (color, bold, italic) - regenerates the image and edits the message
 */
async function handleStyleChange(interaction: any, quoteData: any, messageId: string, mutateStyle: (style: any) => void) {
  // clone and mutate style
  const newStyle = { ...quoteData.style };
  mutateStyle(newStyle);

  // persist updated style
  updateQuote(messageId, { style: newStyle });

  // regenerate image with new style
  const authorObj = {
    displayName: quoteData.authorData.displayName,
    username: quoteData.authorData.username,
    avatarURL: quoteData.authorData.avatarURL,
  };

  const imageBuffer = await generateQuoteImage(quoteData.content, authorObj, newStyle);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'quote.png' });
  const row = createQuoteButtons();

  await interaction.editReply({
    content: `[Jump to original message](${quoteData.originalMessageUrl})`,
    files: [attachment],
    attachments: [], // clear old attachment
    components: [row]
  });
}

// legacy export name for backwards compatibility
const handleQuoteRemoval = handleQuoteButton;

export { handleQuoteButton, handleQuoteRemoval };
export default {
  handleQuoteButton,
  handleQuoteRemoval
};