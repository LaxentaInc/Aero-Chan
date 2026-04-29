import { SlashCommandBuilder, ChannelType, MessageFlags } from "discord.js";
import fs from "fs";
import path from "path";
// Save the leaver config in the root directory.
const configFilePath = path.join(process.cwd(), "leaver.json");

// Helper functions to load and save config.
function loadConfig() {
  if (fs.existsSync(configFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    } catch (e: any) {
      console.error("Error reading leaver config:", e);
      return {};
    }
  }
  return {};
}
function saveConfig(config: any) {
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
}
export default {
  data: new SlashCommandBuilder().setName('leaver').setDescription('Configure the leaver system for your server.').addBooleanOption((option: any) => option.setName('enabled').setDescription('Enable or disable the leaver system.').setRequired(true)).addChannelOption((option: any) => option.setName('channel').setDescription('Channel where leave messages will be sent.').addChannelTypes(ChannelType.GuildText).setRequired(true)).addAttachmentOption((option: any) => option.setName('background').setDescription('Optional custom background image for leaver.').setRequired(false)),
  async execute(interaction: any) {
    // Permission check: Require Manage Server (or Administrator/Owner).
    if (!interaction.member.permissions.has("MANAGE_GUILD")) {
      return interaction.reply({
        content: "You need the Manage Server permission to use this command.",
        ephemeral: true
      });
    }
    const enabled = interaction.options.getBoolean('enabled');
    const channel = interaction.options.getChannel('channel');
    const background = interaction.options.getAttachment('background');
    let config = loadConfig();
    config[interaction.guild.id] = {
      enabled,
      channelId: channel.id,
      background: background ? background.url : null
    };
    saveConfig(config);
    await interaction.reply({
      content: `Leaver system has been ${enabled ? 'enabled' : 'disabled'} in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral
    });
  }
};