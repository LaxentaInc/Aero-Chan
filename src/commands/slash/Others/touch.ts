import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
// ========== counter ==========
const TOUCH_STATS_PATH = path.join(__dirname, '../../../data/touch_stats.json');
const loadStats = () => {
  try {
    if (!fs.existsSync(TOUCH_STATS_PATH)) {
      fs.writeFileSync(TOUCH_STATS_PATH, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(TOUCH_STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const saveStats = (s: any) => {
  try {
    fs.writeFileSync(TOUCH_STATS_PATH, JSON.stringify(s, null, 2), 'utf8');
  } catch (e: any) {
    console.error('failed to save touch stats:', e);
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
  data: new SlashCommandBuilder().setName('touch').setDescription('Hold someone! NO touch them! How romantic~').setIntegrationTypes(0, 1).setContexts(0, 1, 2).addUserOption((option: any) => option.setName('partner').setDescription('The user whose hand you want to TOUCH').setRequired(false)),
  async execute(interaction: any) {
    const targetUser = interaction.options.getUser('partner');
    let components = [];
    if (targetUser && targetUser.id !== interaction.user.id) {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('blush_back').setLabel('Blush!').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('kiss_back').setLabel('Kiss!?').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('happy_back').setLabel('TOUCH BACK AGGRESSIVELY!').setStyle(ButtonStyle.Success));
      components.push(row);
    }
    await interaction.deferReply();
    try {
      // fetch gif from nekos.best api
      const holdRes = await (axios.get('https://nekos.best/api/v2/hug', {
        timeout: 5000
      }) as any);
      const holdGif = holdRes.data.results[0].url;
      if (!holdGif) {
        return interaction.editReply({
          content: 'failed to find a hand-holding animation!'
        });
      }
      let desc;
      if (targetUser && targetUser.id !== interaction.user.id) {
        const count = incrementCount(interaction.user.id, targetUser.id);
        desc = `-# **${interaction.user.username}** touches **${targetUser.username}!** prob sweet~\n` + `-# ***${interaction.user.username}** has touched **${targetUser.username}** ${count} ${count === 1 ? 'time' : 'times'}.*`;
      } else {
        desc = `-# **${interaction.user.username}** touches themselves... loneliness intensifies.`;
      }
      const embed = new EmbedBuilder().setDescription(desc).setImage(holdGif);
      const reply = await interaction.editReply({
        embeds: [embed],
        components
      });
      if (!targetUser || targetUser.id === interaction.user.id) return;
      const collector = reply.createMessageComponentCollector({
        time: 30000,
        filter: (i: any) => i.user.id === targetUser.id
      });
      collector.on('collect', async (i: any) => {
        let actionGif, responseDesc;

        // fetch the appropriate gif from nekos.best
        const actions = {
          blush_back: 'blush',
          kiss_back: 'kiss',
          happy_back: 'happy'
        };
        const action = actions[i.customId] || 'happy';
        const res = await (axios.get(`https://nekos.best/api/v2/${action}`, {
          timeout: 5000
        }) as any);
        actionGif = res.data.results[0].url;
        if (i.customId === 'blush_back') {
          responseDesc = `-# **${targetUser.username}** blushes as **${interaction.user.username}** touches them!`;
        } else if (i.customId === 'kiss_back') {
          responseDesc = `-# **${targetUser.username}** gives **${interaction.user.username}** a kiss while being touched!`;
        } else {
          responseDesc = `-# **${targetUser.username}** aggressively *touches* **${interaction.user.username}** back, crazyyy lol!`;
        }
        const responseEmbed = new EmbedBuilder().setDescription(responseDesc).setImage(actionGif);
        components[0].components.forEach((btn: any) => btn.setDisabled(true));
        await i.update({
          components
        });
        await interaction.followUp({
          embeds: [responseEmbed]
        });
        collector.stop();
      });
      collector.on('end', async (collected: any, reason: any) => {
        if (reason === 'time' && collected.size === 0) {
          components[0].components.forEach((btn: any) => btn.setDisabled(true));
          try {
            await reply.edit({
              components
            });
          } catch (error: any) {
            console.error('failed to update message after collector ended:', error);
          }
        }
      });
    } catch (error: any) {
      console.error(`error executing touch command: ${error.message}`);
      return interaction.editReply({
        content: 'failed to touch!'
      });
    }
  }
};