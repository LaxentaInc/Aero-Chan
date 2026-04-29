import { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import fs from "fs";
import path from "path";
import { registerButton } from "../../../handlers/buttonHandler.js";
import { v4 as uuidv4 } from "uuid";
const helpState = {};

// Helper functions, similar to your ban command.
async function deferSafe(interaction: any) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {
      console.warn("Interaction already deferred or expired.");
    });
  }
}
async function editSafe(interaction: any, options: any) {
  try {
    await interaction.editReply(options);
  } catch (error: any) {
    console.warn("Failed to edit interaction reply. Interaction may have expired or already been handled.");
  }
}
function getCategoryDropdown(dropdownOptions: any, page: any, categoriesPerPage: number = 25) {
  const options = dropdownOptions.slice(page * categoriesPerPage, (page + 1) * categoriesPerPage);
  const select = new StringSelectMenuBuilder().setCustomId("help-category-select").setPlaceholder("Select a category...").addOptions(options);
  return new ActionRowBuilder().addComponents(select);
}
function getCategoryCommandEmbed(categoryName: any, cmds: any, commandPage: any, commandsPerPage: any, client: any) {
  const totalPages = Math.ceil(cmds.length / commandsPerPage);
  const embed = new EmbedBuilder().setColor("#0099ff").setTitle(`Help - ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Commands`).setTimestamp().setFooter({
    text: `Page ${commandPage + 1} of ${totalPages} • do /help to view slash cmds`,
    iconURL: client.user.displayAvatarURL()
  });
  const pageCommands = cmds.slice(commandPage * commandsPerPage, (commandPage + 1) * commandsPerPage);
  for (const cmd of pageCommands) {
    embed.addFields({
      name: `**${cmd.name}**`,
      value: cmd.description,
      inline: false
    } as any);
  }
  return embed;
}
async function createCommandPaginationRow(messageId: any, commandPage: any, totalPages: any, userId: any) {
  const components = [];
  if (commandPage > 0) {
    const prevId = `help-${messageId}-prev-${commandPage}`;
    await registerButton(prevId, [userId], async (interaction: any) => {
      await deferSafe(interaction);
      const state = helpState[messageId];
      if (!state) return;
      state.commandPage--;
      const cmds = state.categories[state.currentCategory];
      const newTotalPages = Math.ceil(cmds.length / state.commandsPerPage);
      const commandEmbed = getCategoryCommandEmbed(state.currentCategory, cmds, state.commandPage, state.commandsPerPage, interaction.client);
      const newRow = await createCommandPaginationRow(messageId, state.commandPage, newTotalPages, userId);
      await editSafe(interaction, {
        embeds: [commandEmbed],
        components: newRow ? [newRow] : []
      });
    }, {
      type: 'custom'
    });
    components.push(new ButtonBuilder().setCustomId(prevId).setLabel("Previous").setStyle(ButtonStyle.Primary));
  }
  if (commandPage < totalPages - 1) {
    const nextId = `help-${messageId}-next-${commandPage}`;
    await registerButton(nextId, [userId], async (interaction: any) => {
      await deferSafe(interaction);
      const state = helpState[messageId];
      if (!state) return;
      state.commandPage++;
      const cmds = state.categories[state.currentCategory];
      const newTotalPages = Math.ceil(cmds.length / state.commandsPerPage);
      const commandEmbed = getCategoryCommandEmbed(state.currentCategory, cmds, state.commandPage, state.commandsPerPage, interaction.client);
      const newRow = await createCommandPaginationRow(messageId, state.commandPage, newTotalPages, userId);
      await editSafe(interaction, {
        embeds: [commandEmbed],
        components: newRow ? [newRow] : []
      });
    }, {
      type: 'custom'
    });
    components.push(new ButtonBuilder().setCustomId(nextId).setLabel("Next").setStyle(ButtonStyle.Primary));
  }
  const backId = `help-${messageId}-back`;
  await registerButton(backId, [userId], async (interaction: any) => {
    await deferSafe(interaction);
    const state = helpState[messageId];
    if (!state) return;
    state.currentCategory = null;
    state.commandPage = 0;
    const mainEmbed = new EmbedBuilder().setColor("#0099ff").setTitle("Help Menu").setDescription("Select a category from the dropdown to view its commands.").setTimestamp().setFooter({
      text: "do /help to view slash cmds",
      iconURL: interaction.client.user.displayAvatarURL()
    });
    const dropdownRow = getCategoryDropdown(state.dropdownOptions, 0);
    await editSafe(interaction, {
      embeds: [mainEmbed],
      components: [dropdownRow]
    });
  }, {
    type: 'custom'
  });
  components.push(new ButtonBuilder().setCustomId(backId).setLabel("Back").setStyle(ButtonStyle.Secondary));
  return components.length > 0 ? new ActionRowBuilder().addComponents(components) : null;
}
export default {
  name: "help",
  cooldown: 30,
  description: "Lists all available prefix commands by category.",
  async execute(message: any) {
    try {
      // Determine the prefix commands folder path
      const prefixFolderPath = path.join(__dirname, "../../prefix");
      // Automatically get all subdirectories in the prefix folder as categories.
      const commandFolders = fs.readdirSync(prefixFolderPath).filter((file: any) => fs.statSync(path.join(prefixFolderPath, file)).isDirectory());

      // Build the categories object based solely on prefix folders
      const categories = {};
      for (const folder of commandFolders) {
        const commandFiles = fs.readdirSync(path.join(prefixFolderPath, folder)).filter((file: any) => file.endsWith(".js"));
        const cmds = commandFiles.map((file: any) => {
          try {
            const command = require(path.join(prefixFolderPath, folder, file));
            return {
              name: command.name,
              description: command.description
            };
          } catch (error: any) {
            console.error(`Error loading command file ${file} in folder ${folder}:`, error);
            return null;
          }
        }).filter((cmd: any) => cmd && cmd.name && cmd.description);
        if (cmds.length) categories[folder] = cmds;
      }
      const dropdownOptions = Object.keys(categories).map((cat: any) => ({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        description: `View commands in the ${cat} category.`,
        value: cat
      }));
      if (dropdownOptions.length === 0) {
        return message.reply("No commands available.");
      }
      const mainEmbed = new EmbedBuilder().setColor("#0099ff").setTitle("Help Menu").setDescription("Select a category from the dropdown to view its commands.").setTimestamp().setFooter({
        text: "do /help to view slash cmds",
        iconURL: message.client.user.displayAvatarURL()
      });
      const dropdownRow = getCategoryDropdown(dropdownOptions, 0);
      const helpMessage = await message.channel.send({
        embeds: [mainEmbed],
        components: [dropdownRow]
      });
      helpState[helpMessage.id] = {
        currentCategory: null,
        commandPage: 0,
        categories,
        dropdownOptions,
        commandsPerPage: 20
      };
      const collector = helpMessage.createMessageComponentCollector({
        time: 300000
      });
      collector.on("collect", async (interaction: any) => {
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({
            content: "You cannot use this.",
            ephemeral: true
          });
          return;
        }
        if (interaction.isStringSelectMenu() && interaction.customId === "help-category-select") {
          const state = helpState[helpMessage.id];
          const chosenCategory = interaction.values[0];
          state.currentCategory = chosenCategory;
          state.commandPage = 0;
          const cmds = state.categories[chosenCategory];
          const totalPages = Math.ceil(cmds.length / state.commandsPerPage);
          const commandEmbed = getCategoryCommandEmbed(chosenCategory, cmds, state.commandPage, state.commandsPerPage, message.client);
          const paginationRow = await createCommandPaginationRow(helpMessage.id, state.commandPage, totalPages, message.author.id);

          // Update the message with the category commands
          await interaction.update({
            embeds: [commandEmbed],
            components: paginationRow ? [paginationRow] : []
          });
        }
      });
      collector.on("end", async () => {
        await helpMessage.edit({
          components: []
        });
        delete helpState[helpMessage.id];
      });
    } catch (error: any) {
      console.error("Error executing help command:", error);
      message.reply("Something went wrong while executing the help command.");
    }
  }
};