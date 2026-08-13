// @ts-nocheck
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { createPlayer, getPlayer } from "./manager";
import { createControlButtons, createSearchEmbed, createTrackAddedEmbed, createQueueEmbed } from "./embeds";
import { EmbedBuilder } from "discord.js";
// Store active collectors
const activeCollectors = new Map();
const searchCollectors = new Map();
function cleanupCollector(guildId: any) {
  if (activeCollectors.has(guildId)) {
    try {
      (activeCollectors.get(guildId) as any).stop();
    } catch (error: any) {}
    activeCollectors.delete(guildId);
  }
}
function cleanupSearchCollector(userId: any) {
  if (searchCollectors.has(userId)) {
    try {
      (searchCollectors.get(userId) as any).stop();
    } catch (error: any) {}
    searchCollectors.delete(userId);
  }
}

/**
 * Play a track - adds to queue and starts if not playing
 * FIXED: Passes the track with encoded property correctly
 */
async function playTrack(player: any, track: any) {
  console.log(`\n▶️ PLAY TRACK requested: ${track.title}`);
  console.log(`   Current track: ${player.queue.current?.title || player.queue.current?.info?.title || 'None'}`);
  console.log(`   Queue length: ${player.queue.tracks.length}`);
  try {
    // Add track to queue - lavalink-client needs the encoded property
    player.queue.add(track);
    console.log(`   Queue after add: ${player.queue.tracks.length}`);

    // If nothing is currently playing, start immediately
    if (!player.playing && !player.paused) {
      console.log(`   ✅ No track playing, starting immediately`);
      await player.play();
      return true;
    } else {
      console.log(`   📋 Track added to queue`);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Failed to play track:', error.message);
    throw error;
  }
}

/**
 * Skip to next track
 */
async function skipTrack(player: any, interaction: any) {
  console.log(`\n⏭️ SKIP requested for guild ${player.guildId}`);
  try {
    const hasNextTrack = player.queue.tracks.length > 0;
    if (!hasNextTrack) {
      console.log(`   ❌ No tracks in queue to skip to`);
      // Still stop current track
      await player.stopPlaying();
      return await interaction.followUp({
        content: 'No more tracks in queue. Stopping playback.',
        flags: 64
      });
    }
    player.skipInProgress = true;
    cleanupCollector(player.guildId);
    await player.skip();
    console.log(`   ✅ Successfully skipped track`);
    await interaction.followUp({
      content: `⏭️ Skipped to next track!`,
      flags: 64
    });
  } catch (error: any) {
    console.error('❌ Skip track error:', error.message);
    player.skipInProgress = false;
    await interaction.followUp({
      content: 'Failed to skip track! Please try again.',
      flags: 64
    }).catch(() => {});
  }
}

/**
 * Stop music and clear queue
 */
async function stopMusic(player: any, interaction: any, message: any) {
  console.log(`\n⏹️ STOP requested for guild ${player.guildId}`);
  try {
    const queueSize = player.queue.tracks.length;
    console.log(`   Clearing queue (${queueSize} tracks)`);
    player.queue.tracks.splice(0, queueSize); // Clear all tracks

    cleanupCollector(player.guildId);
    await player.stopPlaying();
    const disabledControlButtons = createControlButtons(player, true);
    await interaction.editReply({
      components: disabledControlButtons
    });
    await interaction.followUp({
      content: 'Music stopped and queue cleared!',
      flags: 64 // ephemeral
    });
    console.log(`   ✅ Music stopped and queue cleared`);
  } catch (error: any) {
    console.error('❌ Stop music error:', error.message);
  }
}

/**
 * Toggle loop mode
 */
async function toggleLoop(player: any, interaction: any, message: any) {
  try {
    const modes = ['off', 'track', 'queue'];
    const currentIndex = modes.indexOf(player.loop);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    player.loop = nextMode;

    // Set lavalink-client repeat mode
    if (nextMode === 'off') {
      player.setRepeatMode('off');
    } else if (nextMode === 'track') {
      player.setRepeatMode('track');
    } else if (nextMode === 'queue') {
      player.setRepeatMode('queue');
    }
    console.log(`\n🔁 Loop mode changed to: ${nextMode}`);
    const newControlButtons = createControlButtons(player);
    await interaction.editReply({
      components: newControlButtons
    });
    await interaction.followUp({
      content: `Loop mode: **${nextMode.toUpperCase()}**`,
      ephemeral: true
    });
  } catch (error: any) {
    console.error('❌ Toggle loop error:', error.message);
  }
}

/**
 * Show queue
 */
async function showQueue(player: any, interaction: any) {
  console.log(`\n📋 Queue requested for guild ${player.guildId}`);
  try {
    if (player.queue.tracks.length === 0) {
      return await interaction.followUp({
        content: 'Queue is empty!',
        flags: 64
      });
    }
    const queueEmbed = createQueueEmbed(player);
    await interaction.followUp({
      embeds: [queueEmbed],
      flags: 64
    });
    console.log(`   Displayed ${Math.min(10, player.queue.tracks.length)} of ${player.queue.tracks.length} tracks`);
  } catch (error: any) {
    console.error('❌ Show queue error:', error.message);
  }
}

/**
 * Clear queue
 */
function clearQueue(player: any) {
  if (!player) return false;
  const queueLength = player.queue.tracks.length;
  player.queue.tracks.splice(0, queueLength); // Clear all tracks
  console.log(`🗑️ Cleared queue (${queueLength} tracks removed)`);
  return queueLength;
}

/**
 * Handle component interactions
 */
async function handleComponentInteraction(interaction: any, player: any, message: any, client: any) {
  try { await interaction.deferUpdate(); } catch (e) {}
  
  // Fetch fresh player to avoid stale state in closures
  const freshPlayer = getPlayer(client, interaction.guild.id);
  if (!freshPlayer) {
    return await interaction.followUp({
      content: '❌ Player session expired or not found.',
      flags: 64
    });
  }
  const member = interaction.guild.members.cache.get(interaction.user.id) as any;
  const memberVoice = member?.voice?.channelId;
  const botVoice = interaction.guild.members.me?.voice?.channelId;
  if (memberVoice !== botVoice) {
    return await interaction.followUp({
      content: 'You need to be in the same voice channel as me to use controls!',
      flags: 64
    });
  }

  // Handle Dropdowns
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'music_filter') {
      const filter = interaction.values[0];
      const fm = freshPlayer.filterManager;
      switch (filter) {
        case 'clear': await fm.resetFilters(); break;
        case 'nightcore': await fm.toggleNightcore(); break;
        case 'vaporwave': await fm.toggleVaporwave(); break;
        case 'karaoke': await fm.toggleKaraoke(); break;
        case 'rotation': await fm.toggleRotation(); break;
        case 'tremolo': await fm.toggleTremolo(); break;
        case 'vibrato': await fm.toggleVibrato(); break;
        case 'lowpass': await fm.toggleLowPass(); break;
      }
      const updatedButtons = createControlButtons(freshPlayer);
      await interaction.editReply({ components: updatedButtons });
      await interaction.followUp({ content: `Applied filter: **${filter}**`, flags: 64 });
    }
    return;
  }

  if (!interaction.isButton()) return;

  switch (interaction.customId) {
    case 'music_pause_resume':
      const wasPaused = freshPlayer.paused;
      if (wasPaused) {
        await freshPlayer.resume();
      } else {
        await freshPlayer.pause();
      }
      console.log(`   ${wasPaused ? 'Resumed' : 'Paused'} playback`);
      const newControlButtons = createControlButtons(freshPlayer);
      await interaction.editReply({
        components: newControlButtons
      });
      break;
    case 'music_skip':
      await skipTrack(freshPlayer, interaction);
      break;
    case 'music_stop':
      await stopMusic(freshPlayer, interaction, message);
      break;
    case 'music_loop':
      await toggleLoop(freshPlayer, interaction, message);
      break;
    case 'music_queue':
      await showQueue(freshPlayer, interaction);
      break;
    case 'music_autoplay':
      const isAutoplay = freshPlayer.get("autoplay");
      freshPlayer.set("autoplay", !isAutoplay);
      const updatedButtons = createControlButtons(freshPlayer);
      await interaction.editReply({
        components: updatedButtons
      });
      await interaction.followUp({
        content: `Autoplay is now **${!isAutoplay ? 'ON' : 'OFF'}**`,
        ephemeral: true
      });
      break;
    case 'music_shuffle':
      if (freshPlayer.queue.tracks.length > 1) {
        freshPlayer.queue.shuffle();
        await interaction.followUp({
          content: 'Queue shuffled!',
          flags: 64
        });
      } else {
        await interaction.followUp({
          content: 'Not enough tracks in queue to shuffle!',
          flags: 64
        });
      }
      break;
    case 'music_rewind':
      await freshPlayer.seek(Math.max(0, freshPlayer.position - 15000));
      await interaction.followUp({ content: 'Rewinded 15 seconds.', flags: 64 });
      break;
    case 'music_forward':
      await freshPlayer.seek(freshPlayer.position + 15000);
      await interaction.followUp({ content: 'Skipped forward 15 seconds.', flags: 64 });
      break;
    case 'music_lyrics':
      try {
        const lyrics = await freshPlayer.getLyrics();
        if (lyrics && lyrics.text) {
          await interaction.followUp({ content: `**Lyrics for ${freshPlayer.queue.current?.title || 'Current Track'}**\n\n${lyrics.text.substring(0, 1900)}`, flags: 64 });
        } else if (lyrics && lyrics.lines && lyrics.lines.length > 0) {
          const lines = lyrics.lines.map((l: any) => l.line).join('\n');
          await interaction.followUp({ content: `**Lyrics for ${freshPlayer.queue.current?.title || 'Current Track'}**\n\n${lines.substring(0, 1900)}`, flags: 64 });
        } else {
          await interaction.followUp({ content: 'No lyrics found for this track.', flags: 64 });
        }
      } catch (error: any) {
        await interaction.followUp({ content: 'Failed to fetch lyrics.', flags: 64 });
      }
      break;
  }
}

/**
 * Display search results with selection buttons
 */
async function displaySearchResults(client: any, interaction: any, tracks: any, query: any, requester: any, sendNowPlayingEmbed: any) {
  console.log(`\n🔍 Displaying ${tracks.length} search results for: "${query}"`);
  try {
    cleanupSearchCollector(interaction.user.id);
    const displayTracks = tracks.slice(0, 7);
    const searchEmbed = createSearchEmbed(displayTracks, query, interaction);
    const buttonRows = [];
    const firstRow = new ActionRowBuilder();
    const secondRow = new ActionRowBuilder();
    for (let i = 0; i < displayTracks.length; i++) {
      const button = new ButtonBuilder().setCustomId(`select_track_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Primary);
      if (i < 4) {
        firstRow.addComponents(button);
      } else {
        secondRow.addComponents(button);
      }
    }
    const cancelButton = new ButtonBuilder().setCustomId('cancel_search').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('<a:NoSpamming_1326464261953818664:1342443519070961684>');
    if (displayTracks.length <= 4) {
      firstRow.addComponents(cancelButton);
      buttonRows.push(firstRow);
    } else {
      secondRow.addComponents(cancelButton);
      buttonRows.push(firstRow, secondRow);
    }
    const message = await interaction.editReply({
      embeds: [searchEmbed],
      components: buttonRows
    });
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000,
      filter: (i: any) => i.user.id === interaction.user.id
    });
    searchCollectors.set(interaction.user.id, collector);
    collector.on('collect', async (buttonInteraction: any) => {
      try {
        await buttonInteraction.deferUpdate();
        if (buttonInteraction.customId === 'cancel_search') {
          await buttonInteraction.editReply({
            embeds: [new EmbedBuilder().setDescription('❌ Search cancelled!')],
            components: []
          });
          collector.stop();
          return;
        }
        const trackIndex = parseInt(buttonInteraction.customId.split('_')[2]);
        const selectedTrack = displayTracks[trackIndex];
        if (!selectedTrack) {
          await buttonInteraction.followUp({
            content: '❌ Invalid track selection!',
            flags: 64
          });
          return;
        }
        selectedTrack.requester = requester;
        const member = buttonInteraction.guild.members.cache.get(buttonInteraction.user.id) as any;
        if (!member?.voice?.channelId) {
          await buttonInteraction.editReply({
            embeds: [new EmbedBuilder().setDescription('❌ You need to be in a voice channel!')],
            components: []
          });
          collector.stop();
          return;
        }
        let player = getPlayer(client, buttonInteraction.guild.id);
        if (!player) {
          player = await createPlayer(client, buttonInteraction.guild.id, member.voice.channelId, buttonInteraction.channel.id);
        }
        const isPlaying = await playTrack(player, selectedTrack);
        const successEmbed = createTrackAddedEmbed(selectedTrack, player, isPlaying, buttonInteraction.user);
        await buttonInteraction.editReply({
          embeds: [successEmbed],
          components: []
        });
        if (isPlaying && sendNowPlayingEmbed) {
          // Now playing embed is handled by trackStart event
        }
        collector.stop();
      } catch (error: any) {
        console.error('❌ Search selection error:', error.message);
        try {
          await buttonInteraction.followUp({
            content: '❌ Failed to play the selected track!',
            flags: 64
          });
        } catch (replyError: any) {
          console.error('❌ Failed to send error reply:', replyError.message);
        }
      }
    });
    collector.on('end', async (collected: any, reason: any) => {
      searchCollectors.delete(interaction.user.id);
      if (reason === 'time') {
        try {
          await message.edit({
            embeds: [new EmbedBuilder().setDescription('⏱️ Search selection timed out!')],
            components: []
          });
        } catch (error: any) {}
      }
    });
  } catch (error: any) {
    console.error('❌ Failed to display search results:', error.message);
    throw error;
  }
}
export { playTrack, skipTrack, stopMusic, toggleLoop, showQueue, clearQueue, handleComponentInteraction, displaySearchResults, cleanupCollector, cleanupSearchCollector, activeCollectors, searchCollectors };
export default {
  playTrack,
  skipTrack,
  stopMusic,
  toggleLoop,
  showQueue,
  clearQueue,
  handleComponentInteraction,
  displaySearchResults,
  cleanupCollector,
  cleanupSearchCollector,
  activeCollectors,
  searchCollectors
};