import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
const getLaughGif = async () => {
  try {
    const r = await (axios.get('https://nekos.best/api/v2/laugh', {
      timeout: 5000
    }) as any);
    return r.data.results[0].url;
  } catch {
    return null;
  }
};

// ========== counter ==========
const LAUGH_STATS_PATH = path.join(__dirname, '../../../data/laugh_stats.json');
const loadStats = () => {
  try {
    if (!fs.existsSync(LAUGH_STATS_PATH)) {
      fs.writeFileSync(LAUGH_STATS_PATH, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(LAUGH_STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const saveStats = (s: any) => {
  try {
    fs.writeFileSync(LAUGH_STATS_PATH, JSON.stringify(s, null, 2), 'utf8');
  } catch (e: any) {
    console.error('failed to save laugh stats:', e);
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
  data: new SlashCommandBuilder().setName('laugh').setDescription('Laugh at someone or just laugh! tehe~').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user you want to laugh at').setRequired(false)).addBooleanOption((option: any) => option.setName('ephemeral').setDescription('Whether to make the response visible only to you for testing(default: false)')),
  async execute(interaction: any) {
    const targetUser = interaction.options.getUser('target');
    const isEphemeral = interaction.options.getBoolean('ephemeral') || false;
    await interaction.deferReply({
      ephemeral: isEphemeral
    });
    try {
      const laughGif = await getLaughGif();
      if (!laughGif) return interaction.editReply({
        content: 'failed to laugh. try again later!'
      });
      let desc;
      if (targetUser && targetUser.id !== interaction.user.id) {
        const count = incrementCount(interaction.user.id, targetUser.id);
        desc = `-# **${interaction.user.username}** laughs at **${targetUser.username}!**\n` + `-# ***${interaction.user.username}** has laughed at **${targetUser.username}** ${count} ${count === 1 ? 'time' : 'times'}.*`;
      } else {
        desc = `-# **${interaction.user.username}** is laughing! hahaha!`;
      }
      const embed = new EmbedBuilder().setDescription(desc).setImage(laughGif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error: any) {
      console.error(`error fetching laugh gif: ${error.message}`);
      return interaction.editReply({
        content: 'failed to laugh. try again later!'
      });
    }
  }
};