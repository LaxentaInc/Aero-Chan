// @ts-nocheck
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const CUSTOM_ICON = 'https://media.tenor.com/Sb0yPHMgNaUAAAAj/music-disc.gif';

const SOURCE_INFO = {
  spotify: {
    icon: 'Spotify',
    name: 'Spotify'
  },
  youtube: {
    icon: 'YouTube',
    name: 'YouTube'
  },
  soundcloud: {
    icon: 'SoundCloud',
    name: 'SoundCloud'
  },
  bandcamp: {
    icon: 'Bandcamp',
    name: 'Bandcamp'
  },
  twitch: {
    icon: 'Twitch',
    name: 'Twitch'
  },
  http: {
    icon: 'Direct Link',
    name: 'Direct Link'
  }
};

// Enhanced time formatter
function formatTime(ms: any) {
  if (!ms || isNaN(ms)) return '0:00';
  const seconds = Math.floor(ms / 1000 % 60);
  const minutes = Math.floor(ms / (1000 * 60) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * truncate string to max length
 */
function truncate(str: any, maxLength: any) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Create control buttons for the player
 */
function createControlButtons(player: any, disabled: boolean = false) {
  const { StringSelectMenuBuilder } = require('discord.js');

  const filterDropdown = new StringSelectMenuBuilder()
    .setCustomId('music_filter')
    .setPlaceholder('Select an audio filter...')
    .setDisabled(disabled)
    .addOptions([
      { label: 'Clear all filters', value: 'clear', description: 'Reset to original audio' },
      { label: 'Nightcore', value: 'nightcore', description: 'Faster and higher pitch' },
      { label: 'Vaporwave', value: 'vaporwave', description: 'Slower and lower pitch' },
      { label: 'Karaoke', value: 'karaoke', description: 'Removes vocals' },
      { label: 'Rotation', value: 'rotation', description: 'Audio rotates around your head' },
      { label: 'Tremolo', value: 'tremolo', description: 'Wavering volume effect' },
      { label: 'Vibrato', value: 'vibrato', description: 'Wavering pitch effect' },
      { label: 'Low pass', value: 'lowpass', description: 'Muffles high frequencies' }
    ]);

  const row1 = new ActionRowBuilder().addComponents(filterDropdown);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_pause_resume').setLabel(player.paused ? 'Resume' : 'Pause').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    // new ButtonBuilder().setCustomId('music_like').setLabel('Like').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_loop').setLabel('Loop').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('music_shuffle').setLabel('Smart shuffle').setStyle(ButtonStyle.Success).setDisabled(disabled)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_autoplay').setLabel('Autoplay').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('music_stop').setLabel('End session').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );

  return [row1, row2, row3, row4];
}

/**
 * Create the Now Playing embed
 */
function createNowPlayingEmbed(track: any, player: any, client: any) {
  let durationString = formatTime(track.duration || 0);
  if (track.isStream) durationString = 'Live';
  const requester = track.requester ? `<@${track.requester.id || track.requester}>` : 'Auto-play';

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Now playing',
      iconURL: CUSTOM_ICON
    })
    .setDescription(`**Artist:** ${track.author}\n**Duration:** \`${durationString}\`\n**Requested by:** ${requester}`)
    .setTimestamp();

  if (track.title) embed.setTitle(truncate(track.title, 256));
  if (track.uri) embed.setURL(track.uri);
  if (track.artworkUrl) embed.setThumbnail(track.artworkUrl);

  return embed;
}

/**
 * Create search results embed
 */
function createSearchEmbed(tracks: any, query: any, interaction: any) {
  const embed = new EmbedBuilder().setAuthor({
    name: 'Search results',
    iconURL: CUSTOM_ICON
  }).setDescription(`**Query:** \`${query}\`\n\nSelect a track to play:`).setFooter({
    text: `Selection expires in 30 seconds · Requested by ${interaction.user.tag}`,
    iconURL: interaction.user.displayAvatarURL()
  }).setTimestamp();
  tracks.slice(0, 7).forEach((track: any, index: any) => {
    const duration = formatTime(track.duration);
    const sourceInfo = SOURCE_INFO[track.sourceName] || SOURCE_INFO.http;
    embed.addFields({
      name: `${index + 1}. ${track.title || 'Unknown'}`,
      value: `**Artist:** \`${track.author || 'Unknown'}\`\n**Duration:** \`${duration}\` · **Source:** ${sourceInfo.name}`,
      inline: false
    } as any);
  });
  return embed;
}

/**
 * Create success embed after track selection
 */
function createTrackAddedEmbed(track: any, player: any, isPlaying: any, user: any) {
  const sourceInfo = SOURCE_INFO[track.sourceName] || SOURCE_INFO.http;
  return new EmbedBuilder().setAuthor({
    name: isPlaying ? 'Now playing' : 'Added to queue',
    iconURL: CUSTOM_ICON
  }).setTitle(track.title || 'Unknown').setURL(track.uri || null).setThumbnail(track.artworkUrl || CUSTOM_ICON).addFields({
    name: 'Artist',
    value: `\`${track.author || 'Unknown'}\``,
    inline: true
  } as any, {
    name: 'Duration',
    value: `\`${formatTime(track.duration)}\``,
    inline: true
  } as any, {
    name: 'Position',
    value: isPlaying ? '`Now playing`' : `\`#${player.queue.tracks.length}\``,
    inline: true
  } as any).setFooter({
    text: `Requested by ${user.tag}`,
    iconURL: user.displayAvatarURL()
  }).setTimestamp();
}

/**
 * Create queue end embed
 */
function createQueueEndEmbed() {
  return new EmbedBuilder().setAuthor({
    name: 'Queue finished',
    iconURL: CUSTOM_ICON
  }).setDescription('All tracks have been played.').addFields({
    name: 'Ready for more?',
    value: 'Use `/play` to start a new session.'
  } as any).setFooter({
    text: 'Thanks for listening'
  }).setTimestamp();
}

/**
 * Create queue display embed
 */
function createQueueEmbed(player: any) {
  const queueList = player.queue.tracks.slice(0, 10).map((track: any, index: any) => `**${index + 1}.** ${track.title || 'Unknown'} — \`${track.author || 'Unknown'}\``).join('\n');
  return new EmbedBuilder().setAuthor({
    name: 'Music queue',
    iconURL: CUSTOM_ICON
  }).setDescription(queueList || 'Queue is empty.').setFooter({
    text: player.queue.tracks.length > 10 ? `Showing first 10 of ${player.queue.tracks.length} tracks` : `${player.queue.tracks.length} tracks total`,
    iconURL: CUSTOM_ICON
  });
}

/**
 * Create error embed for track exceptions
 */
function createErrorEmbed(track: any, errorMessage: any) {
  return new EmbedBuilder().setAuthor({
    name: 'Playback error',
    iconURL: CUSTOM_ICON
  }).setDescription(`**${track.title || 'Unknown'}** failed to play`).addFields({
    name: 'Error',
    value: `\`${errorMessage || 'Unknown error'}\``
  } as any).setFooter({
    text: 'Skipping to next track',
    iconURL: CUSTOM_ICON
  }).setTimestamp();
}

/**
 * Create loading embed
 */
function createLoadingEmbed(title: any, description: any) {
  return new EmbedBuilder().setAuthor({
    name: 'Loading',
    iconURL: CUSTOM_ICON
  }).setDescription(`${title}\n${description}`).setFooter({
    text: 'This might take a few seconds'
  }).setTimestamp();
}

/**
 * Create skip embed
 */
function createSkipEmbed(currentTrack: any, nextTrack: any) {
  return new EmbedBuilder().setAuthor({
    name: 'Track skipped',
    iconURL: CUSTOM_ICON
  }).setDescription(`Skipped: **${currentTrack}**\nNow playing: **${nextTrack}**`).setTimestamp();
}

/**
 * Create stop embed
 */
function createStopEmbed(queueSize: any) {
  return new EmbedBuilder().setAuthor({
    name: 'Music stopped',
    iconURL: CUSTOM_ICON
  }).setDescription(`Playback stopped and queue cleared (${queueSize} tracks removed)`).setTimestamp();
}

/**
 * Create pause/resume embed
 */
function createPauseEmbed(wasPaused: any) {
  return new EmbedBuilder().setAuthor({
    name: wasPaused ? 'Music resumed' : 'Music paused',
    iconURL: CUSTOM_ICON
  }).setDescription(`Playback ${wasPaused ? 'resumed' : 'paused'}`).setTimestamp();
}

/**
 * Create loop mode change embed
 */
function createLoopEmbed(loopMode: any) {
  return new EmbedBuilder().setAuthor({
    name: 'Loop mode changed',
    iconURL: CUSTOM_ICON
  }).setDescription(`Loop mode: **${loopMode.toUpperCase()}**`).setTimestamp();
}

/**
 * Create queue cleared embed
 */
function createClearEmbed(queueSize: any) {
  return new EmbedBuilder().setAuthor({
    name: 'Queue cleared',
    iconURL: CUSTOM_ICON
  }).setDescription(`Removed ${queueSize} tracks from queue`).setTimestamp();
}

/**
 * Create disconnect embed
 */
function createDisconnectEmbed() {
  return new EmbedBuilder().setAuthor({
    name: 'Disconnected',
    iconURL: CUSTOM_ICON
  }).setDescription('Disconnected from voice channel and cleared all data').setTimestamp();
}

/**
 * Create enhanced queue display embed (replaces inline queue creation)
 */
function createEnhancedQueueEmbed(player: any) {
  let description = '';

  // lavalink-client uses player.queue.current for the currently playing track
  if (player.queue.current) {
    const track = player.queue.current;
    const title = track.title || track.info?.title || 'Unknown';
    const author = track.author || track.info?.author || 'Unknown';
    const duration = track.duration || track.info?.length || 0;
    const uri = track.uri || track.info?.uri || '#';
    description += `**Now playing**\n[${truncate(title, 50)}](${uri})\n`;
    description += `By ${truncate(author, 30)} · ${formatTime(duration)}\n\n`;
  }

  // lavalink-client uses player.queue.tracks for the queue array
  if (player.queue.tracks.length > 0) {
    description += '**Up next**\n';
    const queueList = player.queue.tracks.slice(0, 10).map((track: any, index: any) => {
      const title = track.title || track.info?.title || 'Unknown';
      const author = track.author || track.info?.author || 'Unknown';
      const duration = track.duration || track.info?.length || 0;
      const uri = track.uri || track.info?.uri || '#';
      return `**${index + 1}.** [${truncate(title, 40)}](${uri})\n` + `By ${truncate(author, 30)} · ${formatTime(duration)}`;
    }).join('\n\n');
    description += queueList;
    if (player.queue.tracks.length > 10) {
      description += `\n\n...and ${player.queue.tracks.length - 10} more tracks`;
    }
  } else {
    description += 'Queue is empty';
  }
  return new EmbedBuilder().setAuthor({
    name: 'Music queue',
    iconURL: CUSTOM_ICON
  }).setDescription(description).setFooter({
    text: `${player.queue.tracks.length} tracks in queue · Loop: ${player.loop || 'off'}`,
    iconURL: CUSTOM_ICON
  }).setTimestamp();
}

/**
 * Create play response embed (for URL-based plays)
 */
function createPlayResponseEmbed(tracks: any, startedImmediately: any, player: any) {
  const firstTrack = tracks[0];
  const trackInfo = firstTrack.info || firstTrack;
  const embed = new EmbedBuilder().setAuthor({
    name: startedImmediately ? 'Now playing' : 'Added to queue',
    iconURL: CUSTOM_ICON
  }).setTitle(trackInfo.title || 'Unknown title').setURL(trackInfo.uri || null).setThumbnail(trackInfo.artworkUrl || CUSTOM_ICON).addFields({
    name: 'Artist',
    value: `\`${trackInfo.author || 'Unknown'}\``,
    inline: true
  } as any, {
    name: 'Duration',
    value: `\`${formatTime(trackInfo.length || trackInfo.duration || firstTrack.duration)}\``,
    inline: true
  } as any, {
    name: 'Requested by',
    value: `<@${firstTrack.requester?.id}>`,
    inline: true
  } as any);
  if (tracks.length > 1) {
    embed.addFields({
      name: 'Playlist',
      value: `\`${tracks.length} tracks\``,
      inline: true
    } as any);
  }
  if (player?.queue?.tracks?.length > 0 && !startedImmediately) {
    embed.addFields({
      name: 'Position',
      value: `\`#${player.queue.tracks.length}\``,
      inline: true
    } as any);
  }
  embed.setFooter({
    text: startedImmediately ? 'Use /music queue to see the queue' : `Added to position ${player?.queue?.tracks?.length || 0}`,
    iconURL: CUSTOM_ICON
  }).setTimestamp();
  return embed;
}

/**
 * Create generic error embed
 */
function createGenericErrorEmbed(title: any, description: any) {
  return new EmbedBuilder().setAuthor({
    name: title,
    iconURL: CUSTOM_ICON
  }).setDescription(description).setTimestamp();
}

export { CUSTOM_ICON, SOURCE_INFO, formatTime, truncate, createControlButtons, createNowPlayingEmbed, createSearchEmbed, createTrackAddedEmbed, createQueueEndEmbed, createQueueEmbed, createEnhancedQueueEmbed, createErrorEmbed, createGenericErrorEmbed, createLoadingEmbed, createSkipEmbed, createStopEmbed, createPauseEmbed, createLoopEmbed, createClearEmbed, createDisconnectEmbed, createPlayResponseEmbed };
export default {
  CUSTOM_ICON,
  SOURCE_INFO,
  formatTime,
  truncate,
  createControlButtons,
  createNowPlayingEmbed,
  createSearchEmbed,
  createTrackAddedEmbed,
  createQueueEndEmbed,
  createQueueEmbed,
  createEnhancedQueueEmbed,
  createErrorEmbed,
  createGenericErrorEmbed,
  createLoadingEmbed,
  createSkipEmbed,
  createStopEmbed,
  createPauseEmbed,
  createLoopEmbed,
  createClearEmbed,
  createDisconnectEmbed,
  createPlayResponseEmbed
};