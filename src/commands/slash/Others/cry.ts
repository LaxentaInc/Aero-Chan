import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
export default {
  data: new SlashCommandBuilder().setName('cry').setDescription('*cries*').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user making you cry').setRequired(false)),
  async execute(interaction: any) {
    const target = interaction.options.getUser('target');
    await interaction.deferReply();
    try {
      const response = await (axios.get('https://nekos.best/api/v2/cry', {
        timeout: 5000
      }) as any);
      const gif = response.data.results[0].url;
      if (!gif) return interaction.editReply({
        content: 'too sad to cry...'
      });
      let desc;
      if (target && target.id !== interaction.user.id) {
        desc = `-# **${interaction.user.username}** cries because of **${target.username}!**`;
      } else {
        desc = `-# **${interaction.user.username}** is crying...`;
      }
      const embed = new EmbedBuilder().setDescription(desc).setImage(gif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      await interaction.editReply({
        content: 'failed to cry!'
      });
    }
  }
};