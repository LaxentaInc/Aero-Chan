import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
const getThumbsupGif = async () => {
  try {
    const r = await (axios.get('https://nekos.best/api/v2/thumbsup', {
      timeout: 5000
    }) as any);
    return r.data.results[0].url;
  } catch {
    return null;
  }
};

// ========== counter ==========
const THUMBSUP_STATS_PATH = path.join(__dirname, '../../../data/thumbsup_stats.json');
const loadStats = () => {
  try {
    if (!fs.existsSync(THUMBSUP_STATS_PATH)) {
      fs.writeFileSync(THUMBSUP_STATS_PATH, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(THUMBSUP_STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const saveStats = (s: any) => {
  try {
    fs.writeFileSync(THUMBSUP_STATS_PATH, JSON.stringify(s, null, 2), 'utf8');
  } catch (e: any) {
    console.error('failed to save thumbsup stats:', e);
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
  data: new SlashCommandBuilder().setName('thumbsup').setDescription('Give someone a thumbs up!').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('target').setDescription('The user you want to give a thumbs up to').setRequired(false)).addBooleanOption((option: any) => option.setName('ephemeral').setDescription('Whether to make the response visible only to you (default: false)')),
  async execute(interaction: any) {
    const targetUser = interaction.options.getUser('target');
    const isEphemeral = interaction.options.getBoolean('ephemeral') || false;
    await interaction.deferReply({
      ephemeral: isEphemeral
    });
    try {
      const thumbsupGif = await getThumbsupGif();
      if (!thumbsupGif) return interaction.editReply({
        content: 'failed to give thumbs up. try again later!'
      });
      let desc;
      if (targetUser && targetUser.id !== interaction.user.id) {
        const count = incrementCount(interaction.user.id, targetUser.id);
        desc = `-# **${interaction.user.username}** gives **${targetUser.username}** a thumbs up!**\n` + `-# ***${interaction.user.username}** has given **${targetUser.username}** a thumbs up ${count} ${count === 1 ? 'time' : 'times'}.*`;
      } else {
        desc = `-# **${interaction.user.username}** gives a thumbs up!`;
      }
      const embed = new EmbedBuilder().setDescription(desc).setImage(thumbsupGif);
      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error: any) {
      console.error(`error fetching thumbsup gif: ${error.message}`);
      return interaction.editReply({
        content: 'failed to give thumbs up. try again later!'
      });
    }
  }
};