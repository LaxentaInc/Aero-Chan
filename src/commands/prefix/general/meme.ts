import axios from "axios";
const getMeme = async () => {
  try {
    const response = await (axios.get("https://meme-api.com/gimme") as any);
    const memeUrl = response.data.url;
    return memeUrl;
  } catch (error: any) {
    console.error("Error fetching meme:", error);
    return "Failed to fetch a meme :(";
  }
};
export default {
  name: "meme",
  description: "Sends a random meme.",
  async execute(message: any, args: any) {
    try {
      const memeUrl = await getMeme();
      if (memeUrl.startsWith("http")) {
        await message.channel.send(memeUrl);
        //console.log("Meme command executed successfully.");
      } else {
        message.reply(memeUrl); //fetching failed ;cc
      }
    } catch (error: any) {
      console.error("Error executing the meme command:", error);
      message.reply("There was an error executing that command.");
    }
  }
};