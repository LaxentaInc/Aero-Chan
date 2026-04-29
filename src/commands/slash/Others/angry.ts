import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
// ========== counter ==========
const STATS_PATH = path.join(__dirname, '../../../data/angry_stats.json');
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
    console.error('failed to save angry stats:', e);
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
  data: new SlashCommandBuilder().setName('angry').setDescription('GRRR!').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user you are angry at').setRequired(false)),
  async execute(interaction: any) {
    const target = interaction.options.getUser('target');
    await interaction.deferReply();
    try {
      const response = await (axios.get('https://nekos.best/api/v2/angry', {
        timeout: 5000
      }) as any);
      const gif = response.data.results[0].url;
      if (!gif) return interaction.editReply({
        content: 'too angry to load a gif!'
      });
      let desc;
      if (target && target.id !== interaction.user.id) {
        const count = incrementCount(interaction.user.id, target.id);
        desc = `-# **${interaction.user.username}** is angry at **${target.username}!** grrr!\n-# ***${interaction.user.username}** has raged at **${target.username}** ${count} ${count === 1 ? 'time' : 'times'}.*`;
      } else {
        desc = `-# **${interaction.user.username}** is angryyy! GRRR!`;
      }
      const embed = new EmbedBuilder().setDescription(desc).setImage(gif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      await interaction.editReply({
        content: 'failed to be angry!'
      });
    }
  }
};