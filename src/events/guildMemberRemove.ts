import AMA from "../modules/AMA.js";
import antiNuke from "../modules/AntiNuke.js";
// New anti-nuke module
export default {
  name: 'guildMemberRemove',
  once: false,
  async execute(member: any, client: any) {
    // Log the member removal event
    console.log(`Member ${member.user.tag} left/removed from ${member.guild.name}`);
    try {
      // Check if AMA module is properly loaded
      if (!AMA) {
        console.error('❌ AMA module not loaded properly');
        return;
      }

      // console.log('Available AMA methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(AMA)));

      // Pass the member removal to AMA module for processing
      await AMA.handleMemberRemove(member);
    } catch (error: any) {
      console.error('Error in guildMemberRemove event:', error);
      console.error('Stack trace:', error.stack);
    }
  }
};