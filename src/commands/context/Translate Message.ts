import { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } from "discord.js";
import { translateText, LANGUAGES } from "../../handlers/translations/translationHandler";
export default {
  data: new ContextMenuCommandBuilder().setName('Translate Message').setType(ApplicationCommandType.Message).setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    const targetMessage = interaction.targetMessage;
    const text = targetMessage.content;
    if (!text || text.trim().length === 0) {
      return interaction.reply({
        content: "Uhhhm... This message doesn't have any text content to translate!",
        ephemeral: true
      });
    }
    await interaction.deferReply({
      ephemeral: false
    });
    try {
      const result = await translateText(text, 'en', null);
      const embed = new EmbedBuilder().addFields({
        name: "Original Text",
        value: result.original.length > 1024 ? result.original.slice(0, 1021) + "..." : result.original
      } as any, {
        name: "Translated Text",
        value: result.translated.length > 1024 ? result.translated.slice(0, 1021) + "..." : result.translated
      } as any, {
        name: "Target Language",
        value: LANGUAGES[result.targetLang] || result.targetLang,
        inline: true
      } as any, {
        name: "Source Language",
        value: result.sourceLang === 'auto' ? "Auto-detected" : LANGUAGES[result.sourceLang] || result.sourceLang,
        inline: true
      } as any);
      // .setTimestamp()
      // .setFooter({ text: "Using Aero Translate" });

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error: any) {
      console.error("Context command translation error:", error);
      await interaction.editReply("Error translating text. Our service might be temporarily unavailable.");
    }
  }
};