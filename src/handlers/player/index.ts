import { initializeManager, createPlayer, getPlayer, getNode } from "./manager";
import { searchTrack, searchTrackAlternative, smartSearch, normalizeTrack } from "./search";
import { playTrack, skipTrack, stopMusic, toggleLoop, showQueue, clearQueue, displaySearchResults, handleButtonInteraction, cleanupCollector, cleanupSearchCollector } from "./controls";
import { sendNowPlayingEmbed, sendAutoNowPlayingEmbed, setupPlayerEvents } from "./events";
import { EMBED_COLORS, CUSTOM_ICON, SOURCE_INFO, formatTime, createControlButtons, createNowPlayingEmbed, createSearchEmbed, createTrackAddedEmbed, createQueueEndEmbed, createQueueEmbed, createErrorEmbed } from "./embeds";
/**
 * Player Module - Main Entry Point
 * Modular lavalink player system for Laxenta
 */
/**
 * Initialize the player system and attach methods to client
 */
export default (client: any) => {
  // Initialize LavalinkManager
  initializeManager(client);

  // Setup player events
  setupPlayerEvents(client);

  // Attach search methods
  client.searchTrack = (query: any, requester: any, source: any) => searchTrack(client, query, requester, source);
  client.searchTrackAlternative = (query: any, requester: any, source: any) => searchTrackAlternative(client, query, requester, source);
  client.smartSearch = (query: any, requester: any) => smartSearch(client, query, requester);

  // Attach display methods
  client.displaySearchResults = (interaction: any, tracks: any, query: any, requester: any) => displaySearchResults(client, interaction, tracks, query, requester, (i: any, p: any, t: any) => sendNowPlayingEmbed(i, p, t, client));

  // Attach player control methods
  client.playTrack = playTrack;
  client.createPlayer = (guildId: any, voiceChannelId: any, textChannelId: any) => createPlayer(client, guildId, voiceChannelId, textChannelId);
  client.getPlayer = (guildId: any) => getPlayer(client, guildId);
  client.clearQueue = (guildId: any) => {
    const player = getPlayer(client, guildId);
    return clearQueue(player);
  };
  client.destroyPlayer = (guildId: any) => {
    const player = getPlayer(client, guildId);
    if (player) {
      player.destroy();
      console.log(`🗑️ Destroyed player for guild ${guildId}`);
    }
  };

  // Attach embed methods
  client.sendNowPlayingEmbed = (interaction: any, player: any, track: any) => sendNowPlayingEmbed(interaction, player, track, client);
  client.sendAutoNowPlayingEmbed = (contextOrClient: any, player: any, track: any) => sendAutoNowPlayingEmbed(client, player, track);
  console.log('✅ Player module initialized with lavalink-client');
}; // Export all for direct imports if needed
export const manager = require('./manager');
export const search = require('./search');
export const controls = require('./controls');
export const events = require('./events');
export const embeds = require('./embeds');