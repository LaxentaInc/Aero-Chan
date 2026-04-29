import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
// ========== counter ==========
const STATS_PATH = path.join(__dirname, '../../../data/bite_stats.json');
const loadStats = () => {
  try {
    if (!fs.existsSync(STATS_PATH)) {
      fs.writeFileSync(STATS_PATH, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const saveStats = (s: any) => {
  try {
    fs.writeFileSync(STATS_PATH, JSON.stringify(s, null, 2), 'utf8');
  } catch (e: any) {
    console.error('failed to save bite stats:', e);
  }
};
const incrementCount = (id1: any, id2: any) => {
  const s = loadStats();
  const k = [id1, id2].sort().join(':');
  s[k] = (s[k] || 0) + 1;
  saveStats(s);
  return s[k];
};
export default {
  data: new SlashCommandBuilder().setName('bite').setDescription('Bite someone! Nom~').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user you want to bite').setRequired(true)),
  async execute(interaction: any) {
    const target = interaction.options.getUser('target');
    if (target.id === interaction.user.id) return interaction.reply({
      content: "you can't bite yourself!",
      ephemeral: true
    });
    await interaction.deferReply();
    try {
      const response = await (axios.get('https://nekos.best/api/v2/bite', {
        timeout: 5000
      }) as any);
      const gif = response.data.results[0].url;
      if (!gif) return interaction.editReply({
        content: 'couldn\'t fetch a bite gif. try again!'
      });
      const count = incrementCount(interaction.user.id, target.id);
      const embed = new EmbedBuilder().setDescription(`-# **${interaction.user.username}** bites **${target.username}!**\n-# ***${interaction.user.username}** has bitten **${target.username}** ${count} ${count === 1 ? 'time' : 'times'}.*`).setImage(gif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      await interaction.editReply({
        content: 'failed to bite!'
      });
    }
  }
};