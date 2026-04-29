import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import antiRaid from "../../../modules/anti_raid";
/*
=== ANTI-RAID COMMAND ===
Simple slash command for main anti-raid toggle and system status.
Individual module configs are handled via frontend.
*/
// Adjust path as needed
export default {
  data: new SlashCommandBuilder().setName('antiraid').setDescription('Anti-raid system management').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addSubcommand((subcommand: any) => subcommand.setName('status').setDescription('Check anti-raid system status')).addSubcommand((subcommand: any) => subcommand.setName('toggle').setDescription('Enable or disable anti-raid system').addBooleanOption((option: any) => option.setName('enabled').setDescription('Enable or disable anti-raid protection').setRequired(true)))
  // .addSubcommand(subcommand =>
  //     subcommand
  //         .setName('modules')
  //         .setDescription('List all loaded anti-raid modules')
  // )
  .addSubcommand((subcommand: any) => subcommand.setName('emergency').setDescription('Emergency disable all anti-raid modules')).addSubcommand((subcommand: any) => subcommand.setName('stats').setDescription('Show system-wide anti-raid statistics')),
  async execute(interaction: any) {
    const subcommand = interaction.options.getSubcommand();
    try {
      switch (subcommand) {
        case 'status':
          await handleStatus(interaction);
          break;
        case 'toggle':
          await handleToggle(interaction);
          break;
        case 'modules':
          await handleModules(interaction);
          break;
        case 'emergency':
          await handleEmergency(interaction);
          break;
        case 'stats':
          await handleStats(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown subcommand',
            ephemeral: true
          });
      }
    } catch (error: any) {
      console.error('Error executing antiraid command:', error);
      const reply = {
        content: '❌ An error occurred while executing the command',
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }
};
async function handleStatus(interaction: any) {
  const status = antiRaid.getGuildStatus(interaction.guild.id);
  const embed = new EmbedBuilder().setTitle('🛡️ Anti-Raid System Status').setColor(status.antiRaidEnabled ? 0x00ff00 : 0xff0000).addFields({
    name: 'System Status',
    value: status.antiRaidEnabled ? '✅ Enabled' : '❌ Disabled',
    inline: true
  } as any, {
    name: 'Modules Loaded',
    value: status.moduleCount.toString(),
    inline: true
  } as any, {
    name: 'Database',
    value: status.isConnectedToMongoDB ? '✅ Connected' : '❌ Disconnected',
    inline: true
  } as any).setTimestamp();

  // Add module status fields
  let moduleStatusText = '';
  for (const [moduleName, moduleStatus] of Object.entries(status.modules)) {
    // Check if enabled - modules are enabled by default unless explicitly disabled
    const isEnabled = moduleStatus.enabled !== false && moduleStatus.config?.enabled !== false;
    const statusIcon = isEnabled ? '✅' : '❌';
    const displayName = moduleName.replace('_', ' ').replace(/\b\w/g, (l: any) => l.toUpperCase());
    moduleStatusText += `${statusIcon} **${displayName}**\n`;
  }
  if (moduleStatusText) {
    embed.addFields({
      name: 'Module Status',
      value: moduleStatusText || 'No modules loaded',
      inline: false
    } as any);
  }

  // Add footer with config info
  embed.setFooter({
    text: 'Use /antiraid toggle to enable/disable • Module configs via dashboard'
  });
  await interaction.reply({
    embeds: [embed]
  });
}
async function handleToggle(interaction: any) {
  const enabled = interaction.options.getBoolean('enabled');
  const success = await antiRaid.toggleAntiRaid(interaction.guild.id, enabled);
  if (success) {
    const embed = new EmbedBuilder().setTitle('⚙️ Anti-Raid System Updated').setDescription(`Anti-raid protection has been **${enabled ? 'enabled' : 'disabled'}** for this server`).setColor(enabled ? 0x00ff00 : 0xff0000).addFields({
      name: 'What this affects:',
      value: enabled ? '• All anti-raid modules will become active\n• Bot protection, join monitoring, etc.\n• Configure individual modules via dashboard' : '• All anti-raid modules will be disabled\n• Server returns to normal operation\n• No automatic protections active'
    } as any).setTimestamp();
    await interaction.reply({
      embeds: [embed]
    });
  } else {
    await interaction.reply({
      content: '❌ Failed to update anti-raid settings. Check database connection.',
      ephemeral: true
    });
  }
}
async function handleModules(interaction: any) {
  const loadedModules = antiRaid.getLoadedModules();
  const status = antiRaid.getGuildStatus(interaction.guild.id);
  const embed = new EmbedBuilder().setTitle('📦 Loaded Anti-Raid Modules').setColor(0x0099ff).setDescription(`Found ${loadedModules.length} modules in the system`).setTimestamp();
  if (loadedModules.length > 0) {
    let moduleList = '';
    for (const moduleName of loadedModules) {
      const moduleStatus = status.modules[moduleName];
      const statusIcon = moduleStatus?.enabled === true ? '✅' : moduleStatus?.enabled === false ? '❌' : '⚠️';
      const displayName = moduleName.replace('_', ' ').replace(/\b\w/g, (l: any) => l.toUpperCase());
      moduleList += `${statusIcon} **${displayName}**\n`;
      if (moduleStatus?.config) {
        // Add some key config details
        if (moduleName === 'bot_protection') {
          moduleList += `   ↳ Min bot age: ${moduleStatus.config.minBotAge}d\n`;
        } else if (moduleName === 'join_rate_monitor') {
          moduleList += `   ↳ Threshold: ${moduleStatus.config.joinThreshold} joins/${moduleStatus.config.timeWindow}s\n`;
        }
      }
    }
    embed.addFields({
      name: 'Module Details',
      value: moduleList
    } as any);
  } else {
    embed.addFields({
      name: 'No Modules Found',
      value: 'No anti-raid modules detected in the system'
    } as any);
  }
  embed.setFooter({
    text: 'Configure individual modules via the web dashboard'
  });
  await interaction.reply({
    embeds: [embed]
  });
}
async function handleEmergency(interaction: any) {
  await interaction.deferReply();
  try {
    await antiRaid.emergencyDisable(interaction.guild.id);
    const embed = new EmbedBuilder().setTitle('🚨 EMERGENCY SHUTDOWN COMPLETE').setDescription('All anti-raid modules have been emergency disabled for this server').setColor(0xff0000).addFields({
      name: 'Actions Taken:',
      value: '• Anti-raid system disabled\n• All modules stopped\n• Automatic protections removed\n• Server returned to normal operation'
    } as any).setTimestamp().setFooter({
      text: 'Use /antiraid toggle to re-enable when ready'
    });
    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error: any) {
    await interaction.editReply({
      content: '❌ Emergency shutdown failed. Check console for details.',
      ephemeral: true
    });
  }
}
async function handleStats(interaction: any) {
  const systemStats = antiRaid.getSystemStats();
  const embed = new EmbedBuilder().setTitle('📊 Anti-Raid System Statistics').setColor(0x9932cc).addFields({
    name: 'Total Modules',
    value: systemStats.totalModules.toString(),
    inline: true
  } as any, {
    name: 'Total Guilds',
    value: systemStats.totalGuilds.toString(),
    inline: true
  } as any, {
    name: 'Enabled Guilds',
    value: systemStats.enabledGuilds.toString(),
    inline: true
  } as any, {
    name: 'Disabled Guilds',
    value: systemStats.disabledGuilds.toString(),
    inline: true
  } as any, {
    name: 'Database Status',
    value: systemStats.mongoConnected ? '✅ Connected' : '❌ Disconnected',
    inline: true
  } as any, {
    name: 'Loaded Modules',
    value: systemStats.moduleNames.map((name: any) => name.replace('_', ' ').replace(/\b\w/g, (l: any) => l.toUpperCase())).join('\n') || 'None',
    inline: false
  } as any).setTimestamp().setFooter({
    text: 'System-wide statistics across all servers'
  });
  await interaction.reply({
    embeds: [embed]
  });
}