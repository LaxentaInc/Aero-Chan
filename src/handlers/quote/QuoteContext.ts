import { getQuote, removeQuote, updateQuote } from "./storage";
import { generateQuoteImage, convertToGif, TEXT_COLORS, THEMES, FONTS_LIST, SIZES, QuoteStyle } from "./imageGenerator";
import { logger } from "../../utils/logger";
import { MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";

/**
 * build the component rows (buttons + dropdowns)
 */
function createQuoteComponents(style: QuoteStyle) {
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quote_toggle').setLabel('Toggle Quotes').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote_gif').setLabel('GIF').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote_color').setLabel('Color').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quote_bold').setLabel('Bold').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote_italic').setLabel('Italic').setStyle(ButtonStyle.Secondary),
  );

  const themeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_theme')
      .setPlaceholder('Select Theme')
      .addOptions(THEMES.map(t => ({ label: t.label, value: t.value, emoji: t.emoji, default: t.value === style.theme })))
  );

  const fontRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_font')
      .setPlaceholder('Select Font')
      .addOptions(FONTS_LIST.map(f => ({ label: f.label, value: f.value, emoji: f.emoji, default: f.value === style.font })))
  );

  const sizeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_size')
      .setPlaceholder('Select Size')
      .addOptions(SIZES.map(s => ({ label: s.label, value: s.value, emoji: s.emoji, default: s.value === style.size })))
  );

  return [buttonRow, themeRow, fontRow, sizeRow];
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
    // --- String Select Menus ---
    if (interaction.isStringSelectMenu()) {
      if (customId === 'quote_theme') {
        return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
          style.theme = interaction.values[0];
        });
      }
      if (customId === 'quote_font') {
        return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
          style.font = interaction.values[0];
        });
      }
      if (customId === 'quote_size') {
        return await handleStyleChange(interaction, quoteData, messageId, (style: any) => {
          style.size = interaction.values[0];
        });
      }
    }

    // --- Buttons ---
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
  const components = createQuoteComponents(quoteData.style);

  await interaction.editReply({
    content: `[Jump to original message](${quoteData.originalMessageUrl})`,
    files: [attachment],
    attachments: [],
    components: components
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
  const components = createQuoteComponents(newStyle);

  await interaction.editReply({
    content: `[Jump to original message](${quoteData.originalMessageUrl})`,
    files: [attachment],
    attachments: [], // clear old attachment
    components: components
  });
}

// legacy export name for backwards compatibility
const handleQuoteRemoval = handleQuoteButton;

export { handleQuoteButton, handleQuoteRemoval, createQuoteComponents };
export default {
  handleQuoteButton,
  handleQuoteRemoval,
  createQuoteComponents
};