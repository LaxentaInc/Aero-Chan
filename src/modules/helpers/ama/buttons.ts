import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { registerButton } from "../../../handlers/buttonHandler";
import { saveButtons, getValidButtons } from "../GlobalButtonStorage";
/**
 * AMA Button Handler
 * Handles persistent buttons for Mass Action Protection
 */

const MODULE_NAME = 'ama';
const LOG_PREFIX = '[AMA Buttons]';

/**
 * Initialize and restore buttons on startup
 */
async function init(client: any) {
  try {
    const validButtons = getValidButtons(MODULE_NAME);
    let restoredCount = 0;
    for (const meta of validButtons) {
      await registerButton(meta.customId, [], async (interaction: any) => {
        await handleButtonInteraction(interaction, meta);
      });
      restoredCount++;
    }
    console.log(`${LOG_PREFIX} ✅ Restored ${restoredCount} persistent buttons`);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to init buttons:`, err);
  }
}

/**
 * Register a new button and persist it to disk
 */
async function registerAndPersist(guildId: any, customId: any, meta: any) {
  // 1. Register runtime handler
  await registerButton(customId, [], async (interaction: any) => {
    await handleButtonInteraction(interaction, meta);
  });

  // 2. Persist to JSON
  // Add expiry (24 hours) if not present
  if (!meta.expiresAt) {
    meta.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  }

  // Ensure vital data
  meta.createdAt = Date.now();
  meta.module = MODULE_NAME;
  saveButtons(MODULE_NAME, guildId, {
    [customId]: meta
  });
}

/**
 * Handle button interaction
 */
async function handleButtonInteraction(interaction: any, meta: any) {
  try {
    // lazy load to avoid circular dependency
    const amaModule = require('./index');
    const guildId = meta.guildId || interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: '❌ Error: Guild context missing.',
        ephemeral: true
      });
    }
    const guild = interaction.guild || (await interaction.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return interaction.reply({
        content: '❌ Error: Guild not found.',
        ephemeral: true
      });
    }
    const currentConfig = amaModule.getConfig(guildId);
    const {
      isTrustedUser
    } = require('./detection');

    // Verify Permission
    // interaction.user must be trusted
    const authorized = isTrustedUser(interaction.user, guild, currentConfig);
    if (!authorized) {
      return interaction.reply({
        content: '⛔ You are not authorized to use this button.',
        ephemeral: true
      });
    }
    if (meta.type === 'whitelist_user') {
      await handleWhitelist(interaction, meta, amaModule, currentConfig);
    } else {
      await interaction.reply({
        content: '❓ Unknown button action.',
        ephemeral: true
      });
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Interaction failed:`, err);
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ processing failed.',
        ephemeral: true
      });
    }
  }
}

/**
 * Logic for Whitelisting a user
 */
async function handleWhitelist(interaction: any, meta: any, amaModule: any, currentConfig: any) {
  const targetId = meta.targetId;

  // 1. Check if already whitelisted
  if (currentConfig.trustedUsers.includes(targetId)) {
    return interaction.reply({
      content: '✅ User is already whitelisted.',
      ephemeral: true
    });
  }

  // 2. Update Config
  const newTrusted = [...currentConfig.trustedUsers, targetId];
  await amaModule.updateConfig(meta.guildId, {
    trustedUsers: newTrusted
  });

  // 3. User Feedback
  await interaction.reply({
    content: `✅ **Successfully Whitelisted <@${targetId}>**.\nThey are now exempt from Mass Action checks.`,
    ephemeral: true
  });

  // 4. Simultaneous Update (Visual)
  const relatedMessages = meta.relatedMessages || [];

  // Include the interaction message itself if not present
  if (!relatedMessages.some((m: any) => m.messageId === interaction.message.id)) {
    relatedMessages.push({
      channelId: interaction.channelId,
      messageId: interaction.message.id
    });
  }
  const {
    EmbedBuilder
  } = require('discord.js');
  const updatePromises = relatedMessages.map(async (info: any) => {
    try {
      // Fetch channel
      let channel = interaction.client.channels.cache.get(info.channelId) as any;
      if (!channel) {
        try {
          channel = await interaction.client.channels.fetch(info.channelId);
        } catch (e: any) {
          return;
        }
      }
      if (!channel) return;
      const msg = await channel.messages.fetch(info.messageId).catch(() => null);
      if (!msg) return;

      // Updated Components (Disable all)
      const updatedRows = msg.components.map((row: any) => {
        const newRow = new ActionRowBuilder();
        const newButtons = row.components.map((component: any) => {
          const btn = ButtonBuilder.from(component);
          btn.setDisabled(true);
          if (component.customId === interaction.customId) {
            btn.setLabel('Whitelisted');
            btn.setStyle(ButtonStyle.Success);
            btn.setEmoji('✅');
          }
          return btn;
        });
        return newRow.addComponents(newButtons);
      });

      // Update Embed (Green + Action Field)
      const newEmbed = EmbedBuilder.from(msg.embeds[0]);
      newEmbed.setColor(0x57F287);
      const alreadyUpdated = newEmbed.data.fields?.some((f: any) => f.name && f.name.includes('ACTION UPDATE'));
      if (!alreadyUpdated) {
        newEmbed.addFields({
          name: '✅ ACTION UPDATE',
          value: `**User Whitelisted** by ${interaction.user.username}`,
          inline: false
        } as any);
      }
      await msg.edit({
        embeds: [newEmbed],
        components: updatedRows
      });
    } catch (e: any) {
      console.error(`${LOG_PREFIX} Failed to update related message ${info.messageId}:`, e.message);
    }
  });
  await Promise.all(updatePromises);
}
export { init, registerAndPersist };
export default {
  init,
  registerAndPersist
};