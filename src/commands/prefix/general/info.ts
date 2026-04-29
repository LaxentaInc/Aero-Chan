import { EmbedBuilder } from "discord.js";
// Helper function to format uptime (milliseconds) to a human-readable string.
function formatUptime(ms: any) {
  let seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
export default {
  name: 'info',
  description: 'Provides information ig xd',
  execute(message: any) {
    const client = message.client;
    const uptime = formatUptime(client.uptime);

    // Calculate total user count across all guilds.
    const userCount = client.guilds.cache.reduce((total: any, guild: any) => total + guild.memberCount, 0);
    const embed = new EmbedBuilder().setColor('#0099ff').setTitle('App Information').setThumbnail(client.user.avatarURL()).addFields({
      name: 'Bot Name',
      value: client.user.username,
      inline: true
    } as any, {
      name: 'Bot ID',
      value: client.user.id,
      inline: true
    } as any, {
      name: 'Created At',
      value: client.user.createdAt.toDateString(),
      inline: true
    } as any, {
      name: 'Server Count',
      value: client.guilds.cache.size.toString(),
      inline: true
    } as any, {
      name: 'User Count',
      value: userCount.toString(),
      inline: true
    } as any, {
      name: 'Uptime',
      value: uptime,
      inline: true
    } as any, {
      name: 'Support Server',
      value: '[Support server UwU :)](https://discord.gg/9emnU25HaY)',
      inline: true
    } as any, {
      name: 'Developer',
      value: '@me_straight',
      inline: true
    } as any, {
      name: 'Website',
      value: 'idk so poor for that shit',
      inline: true
    } as any, {
      name: 'GitHub',
      value: 'https://github.com/shelleyloosespatience',
      inline: true
    } as any).setFooter({
      text: 'Bot made with love using Discord.js',
      iconURL: client.user.avatarURL()
    });
    message.channel.send({
      embeds: [embed]
    });
  }
};