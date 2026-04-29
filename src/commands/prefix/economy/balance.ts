import { EmbedBuilder } from "discord.js";
import economy from "../../../utils/economyUtil";
export default {
  name: 'balance',
  aliases: ['bal', 'cash', 'money', 'wallet'],
  description: 'Displays your current balance.',
  async execute(message: any) {
    const userId = message.author.id;
    const balance = await economy.getBalance(userId);
    const embed = new EmbedBuilder().setColor('#FFD700').setAuthor({
      name: `${message.author.username}'s Wallet`,
      iconURL: message.author.displayAvatarURL()
    }).setDescription(`**Balance:** ${economy.formatCurrency(balance)}`).setFooter({
      text: 'Use !daily and !work to earn more!'
    });
    message.channel.send({
      embeds: [embed]
    });
  }
};