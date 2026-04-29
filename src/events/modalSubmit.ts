import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import ticketManager from "../utils/ticketManager";
import { Colors, Messages } from "../utils/constants";
import logger from "../utils/logger";
export default {
  name: Events.InteractionCreate,
  async execute(interaction: any) {
    // EARLY EXIT: Only handle ticket-related interactions
    if (interaction.isModalSubmit()) {
      if (interaction.customId !== "ticket_create_modal") return;
    } else if (interaction.isButton()) {
      if (!interaction.customId.startsWith("ticket_") && interaction.customId !== "create_ticket") return;
    } else {
      return; // Not a button or modal, skip entirely
    }

    // Handle modal submissions first.
    if (interaction.isModalSubmit()) {
      try {
        if (interaction.customId === "ticket_create_modal") {
          const reason = interaction.fields.getTextInputValue("ticket_reason");
          try {
            const channel = await ticketManager.createTicket(interaction.guild, interaction.user, reason);
            await interaction.reply({
              embeds: [{
                color: Colors.SUCCESS,
                description: `${Messages.TICKET_CREATED} Check ${channel.toString()}`
              }],
              ephemeral: true
            });
          } catch (error: any) {
            logger.error("Report to @me_straight bc There is an error creating ticket from modal:", error);
            await interaction.reply({
              embeds: [{
                color: Colors.ERROR,
                description: Messages.ERROR
              }],
              ephemeral: true
            });
          }
        }
      } catch (error: any) {
        logger.error("Error handling modal submit:", error);
        if (!interaction.replied) {
          await interaction.reply({
            embeds: [{
              color: Colors.ERROR,
              description: Messages.ERROR
            }],
            flags: 64
          });
        }
      }
    }
    // Then, handle button interactions.
    else if (interaction.isButton()) {
      if (interaction.customId === "create_ticket") {
        // Open a modal for ticket creation with a reason input.
        const modal = new ModalBuilder().setCustomId("ticket_create_modal").setTitle("Create a Ticket");
        const reasonInput = new TextInputBuilder().setCustomId("ticket_reason").setLabel("Enter ticket reason") // shortened label (< 45 chars)
        .setStyle(TextInputStyle.Paragraph).setRequired(true);
        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);
        return interaction.showModal(modal);
      } else if (interaction.customId.startsWith("ticket_")) {
        try {
          await ticketManager.handleTicketButton(interaction);
        } catch (error: any) {
          logger.error("Error handling ticket button:", error);
          if (!interaction.replied) {
            await interaction.reply({
              embeds: [{
                color: Colors.ERROR,
                description: Messages.ERROR
              }],
              ephemeral: true
            });
          }
        }
      }
    }
  }
};