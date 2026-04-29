import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
export default {
  data: new SlashCommandBuilder().setName('yawn').setDescription('*yawns* so sleepy...').setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    await interaction.deferReply();
    try {
      const response = await (axios.get('https://nekos.best/api/v2/yawn', {
        timeout: 5000
      }) as any);
      const gif = response.data.results[0].url;
      if (!gif) return interaction.editReply({
        content: 'too tired to yawn...'
      });
      const embed = new EmbedBuilder().setDescription(`-# **${interaction.user.username}** yawns... so sleepy...`).setImage(gif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      await interaction.editReply({
        content: 'failed to yawn!'
      });
    }
  }
};