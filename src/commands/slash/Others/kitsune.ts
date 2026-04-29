import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
export default {
  data: new SlashCommandBuilder().setName('kitsune').setDescription('Get a random kitsune image!').setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    await interaction.deferReply();
    try {
      const response = await (axios.get('https://nekos.best/api/v2/kitsune', {
        timeout: 5000
      }) as any);
      const imageUrl = response.data.results[0].url;
      if (!imageUrl) return interaction.editReply({
        content: 'couldn\'t fetch a kitsune image!'
      });
      const embed = new EmbedBuilder().setImage(imageUrl);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      await interaction.editReply({
        content: 'failed to summon a kitsune!'
      });
    }
  }
};