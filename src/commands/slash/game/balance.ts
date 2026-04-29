import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import economy from "../../../utils/economyUtil";
// Cooldown collection
const cooldowns = new Map();

// Helper to format a number with commas
function formatCurrency(num: any) {
  return num.toLocaleString('en-US');
}
export default {
  data: new SlashCommandBuilder().setName('balance').setDescription('Check your current balance').addUserOption((option: any) => option.setName('user').setDescription('Check another user\'s balance (optional)').setRequired(false)),
  async execute(interaction: any) {
    const userId = interaction.options.getUser('user')?.id || interaction.user.id;
    const commandName = 'balance';
    const cooldownAmount = 3000; // 3 seconds cooldown

    // Cooldown check (only for self-balance checks)
    if (userId === interaction.user.id) {
      if (cooldowns.has(interaction.user.id)) {
        const expirationTime = (cooldowns.get(interaction.user.id) as any) + cooldownAmount;
        if (Date.now() < expirationTime) {
          const timeLeft = (expirationTime - Date.now()) / 1000;
          return await interaction.reply({
            content: `⏰ Please wait ${timeLeft.toFixed(1)} more seconds before using this command again.`,
            ephemeral: true
          });
        }
      }

      // Set cooldown
      cooldowns.set(interaction.user.id, Date.now());
      setTimeout(() => cooldowns.delete(interaction.user.id), cooldownAmount);
    }
    // await interaction.deferReply();

    try {
      const balance = await economy.getBalance(userId);
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const embed = new EmbedBuilder().setTitle('Balance').setDescription(`${targetUser.id === interaction.user.id ? 'Your' : `${targetUser.username}'s`} balance is ⏣\`${formatCurrency(balance)}\``)
      // .setColor('#00FF00')
      .setThumbnail(targetUser.displayAvatarURL({
        dynamic: true
      })).setTimestamp().setFooter({
        text: `Requested by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL({
          dynamic: true
        })
      });
      await interaction.reply({
        embeds: [embed]
      });
    } catch (error: any) {
      console.error('Balance command error:', error);
      await interaction.reply({
        content: '❌ An error occurred while fetching the balance. Please try again later.',
        ephemeral: true
      });
    }
  }
};