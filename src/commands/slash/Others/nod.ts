import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
export default {
  data: new SlashCommandBuilder().setName('nod').setDescription('Nod in agreement').setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    await interaction.deferReply();
    try {
      const response = await (axios.get('https://nekos.best/api/v2/nod', {
        timeout: 5000
      }) as any);
      const gif = response.data.results[0].url;
      if (!gif) return interaction.editReply({
        content: 'couldn\'t nod. try again!'
      });
      const embed = new EmbedBuilder().setDescription(`-# **${interaction.user.username}** nods...`).setImage(gif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      await interaction.editReply({
        content: 'failed to nod!'
      });
    }
  }
};