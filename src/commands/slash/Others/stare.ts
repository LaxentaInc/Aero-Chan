import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
const getStareGif = async () => {
  try {
    const r = await (axios.get('https://nekos.best/api/v2/stare', {
      timeout: 5000
    }) as any);
    return r.data.results[0].url;
  } catch {
    return null;
  }
};

// ========== counter ==========
const STARE_STATS_PATH = path.join(__dirname, '../../../data/stare_stats.json');
const loadStats = () => {
  try {
    if (!fs.existsSync(STARE_STATS_PATH)) {
      fs.writeFileSync(STARE_STATS_PATH, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(STARE_STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const saveStats = (s: any) => {
  try {
    fs.writeFileSync(STARE_STATS_PATH, JSON.stringify(s, null, 2), 'utf8');
  } catch (e: any) {
    console.error('failed to save stare stats:', e);
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
  data: new SlashCommandBuilder().setName('stare').setDescription('Stare at someone intensely...').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user you want to stare at').setRequired(true)).addBooleanOption((option: any) => option.setName('ephemeral').setDescription('Whether to make the response visible only to you (default: false)')),
  async execute(interaction: any) {
    const targetUser = interaction.options.getUser('target');
    const isEphemeral = interaction.options.getBoolean('ephemeral') || false;
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: "stop staring at yourself in the mirror! pick someone else.",
        ephemeral: true
      });
    }
    await interaction.deferReply({
      ephemeral: isEphemeral
    });
    try {
      const stareGif = await getStareGif();
      if (!stareGif) return interaction.editReply({
        content: 'failed to stare sadly'
      });
      const count = incrementCount(interaction.user.id, targetUser.id);
      const embed = new EmbedBuilder().setDescription(`-# **${interaction.user.username}** stares at **${targetUser.username}...**\n` + `-# ***${interaction.user.username}** has stared at **${targetUser.username}** ${count} ${count === 1 ? 'time' : 'times'}.*`).setImage(stareGif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error: any) {
      console.error(`error fetching stare gif: ${error.message}`);
      return interaction.editReply({
        content: 'failed to stare sadly'
      });
    }
  }
};