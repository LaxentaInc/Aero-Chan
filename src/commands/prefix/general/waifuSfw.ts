import axios from "axios";
export default {
  name: "waifu",
  description: "Sends a random SFW anime image.",
  usage: "!waifu",
  async execute(message: any, args: any) {
    try {
      const response = await (axios.get("https://api.waifu.pics/sfw/waifu") as any);
      const imageUrl = response.data.url;
      await message.channel.send(imageUrl);
      // console.log("executed successfully.");
    } catch (error: any) {
      console.error("Error:", error);
      message.reply("Please try again later.");
    }
  }
};