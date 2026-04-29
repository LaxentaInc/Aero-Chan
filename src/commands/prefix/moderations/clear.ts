import { logger } from "../../../utils/logger";
import { PermissionsBitField } from "discord.js";
export default {
  name: "clear",
  description: "Clear a specified number of messages from the channel above the command.",
  permissions: [PermissionsBitField.Flags.ManageMessages],
  // ✅ Fixed

  async execute(message: any, args: any) {
    if (!message.member.permissions.has(this.permissions)) {
      return message.reply("<A:eh:1326464297080983655> you lack permissions... meh").then((msg: any) => setTimeout(() => msg.delete().catch(console.error), 1000));
    }
    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0) {
      return message.reply("<:eh:1328691788546048065> only a number above 0 will work").then((msg: any) => setTimeout(() => msg.delete().catch(console.error), 2000));
    }
    const messagesToDelete = Math.min(amount, 99);
    try {
      const messages = await message.channel.messages.fetch({
        limit: messagesToDelete + 1
      });
      const filteredMessages = messages.filter((msg: any) => msg.id !== message.id);
      await message.channel.bulkDelete(filteredMessages, true);
      const confirmationMessage = await message.channel.send(`<a:check:1326464291196370974> Successfully deleted ${filteredMessages.size} messages.`);
      setTimeout(() => confirmationMessage.delete().catch(console.error), 2000);
      message.delete().catch(console.error);
    } catch (error: any) {
      logger.error(`Error executing clear command: ${error}`);
      message.reply("<:sad:1328691744094552064> There was an error trying to clear messages in this channel.").then((msg: any) => setTimeout(() => msg.delete().catch(console.error), 2000));
    }
  }
};