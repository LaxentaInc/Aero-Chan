import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
export default {
  data: new SlashCommandBuilder().setName('info').setDescription('Provides information ig xd').setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    const client = interaction.client;
    const uptime = formatUptime(client.uptime);
    let embed = new EmbedBuilder().setColor('#0099ff').setTitle('App Information').setThumbnail(client.user.avatarURL()).addFields({
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
      value: 'https://www.laxenta.tech/',
      inline: true
    } as any, {
      name: 'GitHub',
      value: 'https://github.com/shelleyloosespatience',
      inline: true
    } as any).setFooter({
      text: 'Bot made with love using Discord.js',
      iconURL: client.user.avatarURL()
    });

    // If executed in a guild, add extra fields
    if (interaction.guild) {
      const userCount = client.guilds.cache.reduce((total: any, guild: any) => total + guild.memberCount, 0);
      embed.addFields({
        name: 'Server Count',
        value: client.guilds.cache.size.toString(),
        inline: true
      } as any, {
        name: 'User Count',
        value: userCount.toString(),
        inline: true
      } as any);
    } else {
      // In DMs, you might want to adjust or remove guild-specific info
      embed.addFields({
        name: 'Note',
        value: 'Guild information is not available in DMs',
        inline: false
      } as any);
    }
    await interaction.reply({
      embeds: [embed]
    });
  }
};
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