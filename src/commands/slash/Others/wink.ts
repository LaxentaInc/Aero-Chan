import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
const getWinkGif = async () => {
  try {
    const r = await (axios.get('https://nekos.best/api/v2/wink', {
      timeout: 5000
    }) as any);
    return r.data.results[0].url;
  } catch {
    return null;
  }
};

// ========== counter ==========
const WINK_STATS_PATH = path.join(__dirname, '../../../data/wink_stats.json');
const loadStats = () => {
  try {
    if (!fs.existsSync(WINK_STATS_PATH)) {
      fs.writeFileSync(WINK_STATS_PATH, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(WINK_STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const saveStats = (s: any) => {
  try {
    fs.writeFileSync(WINK_STATS_PATH, JSON.stringify(s, null, 2), 'utf8');
  } catch (e: any) {
    console.error('failed to save wink stats:', e);
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
  data: new SlashCommandBuilder().setName('wink').setDescription('Wink at someone ;)').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user you want to wink at').setRequired(true)).addBooleanOption((option: any) => option.setName('ephemeral').setDescription('Whether to make the response visible only to you (default: false)')),
  async execute(interaction: any) {
    const targetUser = interaction.options.getUser('target');
    const isEphemeral = interaction.options.getBoolean('ephemeral') || false;
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: "winking at yourself? that's a bit narcissistic, don't you think?",
        ephemeral: true
      });
    }
    await interaction.deferReply({
      ephemeral: isEphemeral
    });
    try {
      const winkGif = await getWinkGif();
      if (!winkGif) return interaction.editReply({
        content: 'failed to wink. try again later!'
      });
      const count = incrementCount(interaction.user.id, targetUser.id);
      const embed = new EmbedBuilder().setDescription(`-# **${interaction.user.username}** winks at **${targetUser.username}~** ;)\n` + `-# ***${interaction.user.username}** has winked at **${targetUser.username}** ${count} ${count === 1 ? 'time' : 'times'}.*`).setImage(winkGif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error: any) {
      console.error(`error fetching wink gif: ${error.message}`);
      return interaction.editReply({
        content: 'failed to wink. try again later!'
      });
    }
  }
};