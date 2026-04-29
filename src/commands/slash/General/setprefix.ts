import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits } from "discord.js";
import GuildPrefix from "../../../utils/guildprefix";
import mongoose from "mongoose";
// File: commands/admin/setPrefix.js
require('dotenv').config(); // Load .env file

const {
  MONGODB_URI
} = process.env;
export default {
  data: new SlashCommandBuilder().setName('setprefix').setDescription('Set a custom prefix for this server.').addStringOption((option: any) => option.setName('prefix').setDescription('The new prefix to set (must be one character).').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: any) {
    const newPrefix = interaction.options.getString('prefix');

    // Enforce a single-character constraint
    if (newPrefix.length !== 1) {
      return await interaction.reply({
        content: 'The prefix must be exactly **one character**.',
        ephemeral: true
      });
    }
    try {
      const guildId = interaction.guild.id;

      // Upsert prefix in MongoDB
      const result = await (GuildPrefix.findOneAndUpdate({
        guildId
      }, {
        prefix: newPrefix
      }, {
        new: true,
        upsert: true
      }) as any);

      // Update global prefix cache
      if (interaction.client.prefixCache) {
        interaction.client.prefixCache.set(guildId, newPrefix);
      }
      await interaction.reply({
        content: `Prefix updated successfully! The new prefix is \`${newPrefix}\`.`,
        ephemeral: true
      });
      console.log(`[INFO] Prefix updated for guild ${guildId}: ${newPrefix}`);
    } catch (error: any) {
      console.error(`[ERROR] Updating Prefix: ${error.message}`);
      await interaction.reply({
        content: 'There was an error updating the prefix. Please try again later.',
        ephemeral: true
      });
    }
  }
};