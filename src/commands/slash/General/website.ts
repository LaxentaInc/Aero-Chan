import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
export default {
  data: new SlashCommandBuilder().setName('colorwall').setDescription('Check out ColorWall, the desktop customization you deserve!').setIntegrationTypes(0, 1).setContexts(0, 1, 2),
  async execute(interaction: any) {
    const WEBSITE_URL = 'https://www.colorwall.xyz';
    const SUPPORT_SERVER = 'https://discord.gg/C9t8dQABgY';
    const embed = new EmbedBuilder().setColor('#000000').setTitle('<a:ehe:1310498098107387974> ColorWall').setDescription(`**The Desktop Customization You Deserve.**\nYour Desktop Called, It wants Personality!!!\n\nAero no longer has a dashboard, but check out our new project **ColorWall**!`).addFields({
      name: '<a:ehe:1376058398403199060> Features',
      value: '• **Ambient & Cinematic Modes** - Immersive customization\n• **Windows 10/11 Support** - Fully compatible with modern Windows\n• **Massive Library** - Hundreds of stunning wallpapers',
      inline: false
    } as any, {
      name: '<a:kittycat:1333358006720794624> Technology',
      value: '• Built blazingly fast with **Rust + Tauri**\n• Extremely lightweight and completely free to use',
      inline: false
    } as any).setThumbnail(interaction.client.user.displayAvatarURL({
      size: 256
    })).setImage('https://media.discordapp.net/attachments/1422947616899207280/1439268419298918490/laxenta.jpg').setFooter({
      text: 'Made with 💙 by @me_straight',
      iconURL: interaction.user.displayAvatarURL()
    }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Visit ColorWall').setStyle(ButtonStyle.Link).setURL(WEBSITE_URL).setEmoji('<a:zzapinkheartexclam_1327982490144:1342442561297711175>'), 
      new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL(SUPPORT_SERVER).setEmoji('<a:pats_1327965154998095973:1332327251253133383>')
    );
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false
    });
  }
};