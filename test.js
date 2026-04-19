/*
=== REALISTIC ANTI-NUKE BATCH DELETION TEST ===
This simulates REAL raid bot behavior:
1. Targets ALL existing channels (no creation phase)
2. Uses aggressive batch deletion (30-50 parallel requests)
3. Tracks exact timing and permission changes
4. Shows your anti-nuke's response time under pressure
*/

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const CONFIG = {
    testServerId: '1260534392124735498',

    // Raid Configuration (real-world raid bot settings)
    batchSize: 40, // Most raid bots delete 30-50 channels simultaneously
    batchDelay: 5, // Minimal delay (5-20ms) between batches

    // Safety Settings
    excludeChannels: [], // Add channel IDs to protect specific channels
    excludeCategories: false, // Set to true to skip categories (currently deletes everything)

    // Testing Options
    dryRun: false, // Set to true to see what would be deleted WITHOUT deleting
    maxChannelsToDelete: 999, // Limit total deletions (safety cap)
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

let metrics = {
    attackStart: 0,
    attackEnd: 0,
    firstDeletion: 0,
    firstFailure: 0,
    permissionStripped: 0,

    totalTargeted: 0,
    deletionSuccess: 0,
    deletionFailed: 0,

    deletionTimes: [],
    failureReasons: new Map(),
    batchResults: []
};

client.once('ready', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 Logged in as: ${client.user.tag}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        await runBatchDeletionTest();
    } catch (error) {
        console.error('💥 Critical Error:', error);
    }

    console.log('\n⏳ Waiting 8 seconds for anti-nuke logs to process...\n');
    await sleep(8000);

    printDetailedReport();

    console.log('\n✅ Test complete. Exiting in 3 seconds...');
    await sleep(3000);
    process.exit(0);
});

async function runBatchDeletionTest() {
    const guild = await client.guilds.fetch(CONFIG.testServerId);
    console.log(`📍 Target Server: ${guild.name} (${guild.id})`);
    console.log(`👥 Members: ${guild.memberCount} | 📺 Channels: ${guild.channels.cache.size}\n`);

    // ═══════════════════════════════════════════════════════════
    // PRE-ATTACK: Permission & Target Analysis
    // ═══════════════════════════════════════════════════════════
    const member = await guild.members.fetch(client.user.id);
    const perms = member.permissions;

    console.log(`${'─'.repeat(60)}`);
    console.log('🔐 CURRENT PERMISSIONS CHECK');
    console.log(`${'─'.repeat(60)}`);
    console.log(`├─ ADMINISTRATOR: ${perms.has(PermissionFlagsBits.Administrator) ? '✅' : '❌'}`);
    console.log(`├─ MANAGE_CHANNELS: ${perms.has(PermissionFlagsBits.ManageChannels) ? '✅' : '❌'}`);
    console.log(`├─ MANAGE_ROLES: ${perms.has(PermissionFlagsBits.ManageRoles) ? '✅' : '❌'}`);
    console.log(`├─ BAN_MEMBERS: ${perms.has(PermissionFlagsBits.BanMembers) ? '✅' : '❌'}`);
    console.log(`└─ Highest Role: ${member.roles.highest.name} (Position: ${member.roles.highest.position})\n`);

    if (!perms.has(PermissionFlagsBits.ManageChannels) && !perms.has(PermissionFlagsBits.Administrator)) {
        console.log('⚠️  WARNING: Bot lacks MANAGE_CHANNELS permission. Test will fail immediately.\n');
    }

    // Fetch and filter channels
    await guild.channels.fetch();
    const allChannels = Array.from(guild.channels.cache.values());

    const targetChannels = allChannels.filter(channel => {
        // Skip excluded channels
        if (CONFIG.excludeChannels.includes(channel.id)) return false;

        // Skip categories if configured
        if (CONFIG.excludeCategories && channel.type === ChannelType.GuildCategory) return false;

        // Target ALL channel types including categories
        return [
            ChannelType.GuildText,
            ChannelType.GuildVoice,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildForum,
            ChannelType.GuildStageVoice,
            ChannelType.GuildCategory // ← Now includes categories!
        ].includes(channel.type);
    }).slice(0, CONFIG.maxChannelsToDelete); // Respect safety cap

    console.log(`${'─'.repeat(60)}`);
    console.log('🎯 TARGET ANALYSIS');
    console.log(`${'─'.repeat(60)}`);
    console.log(`├─ Total Channels: ${allChannels.length}`);
    console.log(`├─ Targeted for Deletion: ${targetChannels.length}`);
    console.log(`├─ Batch Size: ${CONFIG.batchSize} channels/batch`);
    console.log(`├─ Batch Delay: ${CONFIG.batchDelay}ms`);
    console.log(`├─ Estimated Batches: ${Math.ceil(targetChannels.length / CONFIG.batchSize)}`);
    console.log(`└─ Mode: ${CONFIG.dryRun ? '🔍 DRY RUN (no actual deletions)' : '💀 LIVE ATTACK'}\n`);

    if (targetChannels.length === 0) {
        console.log('❌ No valid channels to target. Exiting...\n');
        return;
    }

    // Show target breakdown
    const typeBreakdown = {};
    targetChannels.forEach(ch => {
        const typeName = getChannelTypeName(ch.type);
        typeBreakdown[typeName] = (typeBreakdown[typeName] || 0) + 1;
    });

    console.log('📊 Channel Type Breakdown:');
    Object.entries(typeBreakdown).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
    });

    if (CONFIG.dryRun) {
        console.log('\n🔍 DRY RUN MODE - Listing targets:\n');
        targetChannels.forEach((ch, i) => {
            console.log(`   ${i + 1}. ${ch.name} (${getChannelTypeName(ch.type)})`);
        });
        console.log('\n✅ Dry run complete. Set dryRun=false to execute attack.\n');
        return;
    }

    // Final confirmation
    console.log(`\n${'═'.repeat(60)}`);
    console.log('⚠️  ATTACK WILL START IN 3 SECONDS');
    console.log(`${'═'.repeat(60)}\n`);
    await sleep(3000);

    // ═══════════════════════════════════════════════════════════
    // ATTACK EXECUTION: Batch Deletion
    // ═══════════════════════════════════════════════════════════
    console.log(`${'═'.repeat(60)}`);
    console.log('💀 RAID ATTACK INITIATED');
    console.log(`${'═'.repeat(60)}\n`);

    metrics.attackStart = Date.now();
    metrics.totalTargeted = targetChannels.length;

    // Execute batch deletions
    const batches = chunkArray(targetChannels, CONFIG.batchSize);

    for (let batchNum = 0; batchNum < batches.length; batchNum++) {
        const batch = batches[batchNum];
        const batchStartTime = Date.now();

        console.log(`⚡ Batch ${batchNum + 1}/${batches.length} | Deleting ${batch.length} channels in parallel...`);

        const batchPromises = batch.map((channel, idx) =>
            deletionAttempt(channel, batchNum, idx)
        );

        const results = await Promise.allSettled(batchPromises);
        const batchDuration = Date.now() - batchStartTime;

        // Analyze batch results
        const batchSuccess = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const batchFailed = results.length - batchSuccess;

        metrics.batchResults.push({
            batchNum: batchNum + 1,
            size: batch.length,
            success: batchSuccess,
            failed: batchFailed,
            duration: batchDuration
        });

        console.log(`  └─ Completed in ${batchDuration}ms | ✅ ${batchSuccess} | ❌ ${batchFailed}\n`);

        // Stop if permissions lost
        if (batchFailed > 0 && batchSuccess === 0) {
            console.log('🛑 All deletions failing - permissions likely stripped. Stopping attack.\n');
            break;
        }

        // Delay between batches (realistic raid timing)
        if (batchNum < batches.length - 1) {
            await sleep(CONFIG.batchDelay);
        }
    }

    metrics.attackEnd = Date.now();
}

async function deletionAttempt(channel, batchNum, idx) {
    const startTime = Date.now();

    try {
        await channel.delete('Batch deletion raid test');

        const duration = Date.now() - startTime;
        metrics.deletionSuccess++;
        metrics.deletionTimes.push(duration);

        if (!metrics.firstDeletion) {
            metrics.firstDeletion = Date.now();
        }

        const elapsed = Date.now() - metrics.attackStart;
        console.log(`  ✅ [${elapsed}ms] ${channel.name} deleted (${duration}ms)`);

        return { success: true, channel: channel.name, duration };

    } catch (error) {
        const duration = Date.now() - startTime;
        metrics.deletionFailed++;

        const errorType = getErrorType(error);
        metrics.failureReasons.set(errorType, (metrics.failureReasons.get(errorType) || 0) + 1);

        // Track when permissions were stripped
        if (error.code === 50013 && !metrics.permissionStripped) {
            metrics.permissionStripped = Date.now();
        }

        if (!metrics.firstFailure) {
            metrics.firstFailure = Date.now();
        }

        const elapsed = Date.now() - metrics.attackStart;
        console.log(`  ❌ [${elapsed}ms] ${channel.name} failed: ${errorType}`);

        return { success: false, channel: channel.name, error: errorType, duration };
    }
}

function printDetailedReport() {
    const totalDuration = metrics.attackEnd - metrics.attackStart;
    const avgDeletionTime = metrics.deletionTimes.length > 0
        ? Math.round(metrics.deletionTimes.reduce((a, b) => a + b, 0) / metrics.deletionTimes.length)
        : 0;

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RAID TEST RESULTS');
    console.log(`${'═'.repeat(60)}\n`);

    // Overall Stats
    console.log('📈 OVERALL STATISTICS:');
    console.log(`├─ Channels Targeted: ${metrics.totalTargeted}`);
    console.log(`├─ Successfully Deleted: ${metrics.deletionSuccess} (${getPercentage(metrics.deletionSuccess, metrics.totalTargeted)}%)`);
    console.log(`├─ Failed Deletions: ${metrics.deletionFailed} (${getPercentage(metrics.deletionFailed, metrics.totalTargeted)}%)`);
    console.log(`├─ Total Attack Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`└─ Average Deletion Time: ${avgDeletionTime}ms\n`);

    // Timing Breakdown
    console.log('⏱️  TIMING BREAKDOWN:');
    if (metrics.firstDeletion) {
        console.log(`├─ Time to First Deletion: ${metrics.firstDeletion - metrics.attackStart}ms`);
    }
    if (metrics.permissionStripped) {
        const stripTime = metrics.permissionStripped - metrics.attackStart;
        console.log(`├─ Time to Permission Loss: ${stripTime}ms ⚡`);
        console.log(`├─ Channels Deleted Before Strip: ${metrics.deletionSuccess}`);
    }
    if (metrics.firstFailure) {
        console.log(`└─ Time to First Failure: ${metrics.firstFailure - metrics.attackStart}ms\n`);
    } else {
        console.log('└─ No failures detected\n');
    }

    // Batch Analysis
    if (metrics.batchResults.length > 0) {
        console.log('📦 BATCH PERFORMANCE:');
        metrics.batchResults.forEach(batch => {
            console.log(`├─ Batch ${batch.batchNum}: ${batch.success}/${batch.size} successful in ${batch.duration}ms`);
        });
        console.log('');
    }

    // Failure Analysis
    if (metrics.failureReasons.size > 0) {
        console.log('❌ FAILURE BREAKDOWN:');
        const sortedFailures = Array.from(metrics.failureReasons.entries())
            .sort((a, b) => b[1] - a[1]);
        sortedFailures.forEach(([reason, count]) => {
            console.log(`├─ ${reason}: ${count}x (${getPercentage(count, metrics.deletionFailed)}%)`);
        });
        console.log('');
    }

    // Anti-Nuke Performance Rating
    console.log('🛡️  ANTI-NUKE PERFORMANCE RATING:');
    const rating = getAntiNukeRating();
    console.log(`├─ Protection Level: ${rating.level}`);
    console.log(`├─ Response Speed: ${rating.speed}`);
    console.log(`├─ Damage Mitigation: ${rating.mitigation}`);
    console.log(`└─ Overall Grade: ${rating.grade}\n`);

    console.log(`${'═'.repeat(60)}\n`);
}

function getAntiNukeRating() {
    const deletedCount = metrics.deletionSuccess;
    const responseTime = metrics.permissionStripped ? metrics.permissionStripped - metrics.attackStart : null;

    let level, speed, mitigation, grade;

    // Protection Level
    if (deletedCount === 0) {
        level = '🏆 PERFECT - No channels deleted';
        grade = 'S+';
    } else if (deletedCount <= 2) {
        level = '✅ EXCELLENT - Minimal damage (≤2 channels)';
        grade = 'S';
    } else if (deletedCount <= 5) {
        level = '✅ VERY GOOD - Limited damage (≤5 channels)';
        grade = 'A';
    } else if (deletedCount <= 10) {
        level = '⚠️  GOOD - Moderate damage (≤10 channels)';
        grade = 'B';
    } else if (deletedCount <= 20) {
        level = '⚠️  FAIR - Noticeable damage (≤20 channels)';
        grade = 'C';
    } else {
        level = '❌ NEEDS IMPROVEMENT - High damage (>20 channels)';
        grade = 'D';
    }

    // Response Speed
    if (responseTime === null) {
        speed = '❓ No permission strip detected';
    } else if (responseTime < 100) {
        speed = '⚡ INSTANT (< 100ms)';
    } else if (responseTime < 300) {
        speed = '✅ VERY FAST (< 300ms)';
    } else if (responseTime < 500) {
        speed = '✅ FAST (< 500ms)';
    } else if (responseTime < 1000) {
        speed = '⚠️  MODERATE (< 1s)';
    } else {
        speed = '❌ SLOW (> 1s)';
    }

    // Damage Mitigation
    const protectionRate = getPercentage(metrics.deletionFailed, metrics.totalTargeted);
    if (protectionRate >= 95) {
        mitigation = `🏆 ${protectionRate}% of channels protected`;
    } else if (protectionRate >= 80) {
        mitigation = `✅ ${protectionRate}% of channels protected`;
    } else if (protectionRate >= 60) {
        mitigation = `⚠️  ${protectionRate}% of channels protected`;
    } else {
        mitigation = `❌ ${protectionRate}% of channels protected`;
    }

    return { level, speed, mitigation, grade };
}

// Helper Functions
function getChannelTypeName(type) {
    const types = {
        [ChannelType.GuildText]: 'Text',
        [ChannelType.GuildVoice]: 'Voice',
        [ChannelType.GuildCategory]: 'Category',
        [ChannelType.GuildAnnouncement]: 'Announcement',
        [ChannelType.GuildStageVoice]: 'Stage',
        [ChannelType.GuildForum]: 'Forum'
    };
    return types[type] || 'Unknown';
}

function getErrorType(error) {
    if (error.code === 50013) return 'Missing Permissions';
    if (error.code === 50001) return 'Missing Access';
    if (error.code === 10003) return 'Unknown Channel';
    if (error.code === 30013) return 'Maximum Channels';
    return error.message || 'Unknown Error';
}

function getPercentage(part, total) {
    return total === 0 ? 0 : Math.round((part / total) * 100);
}

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Error Handling
client.on('error', error => {
    console.error('❌ Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled Promise Rejection:', error);
});

// Login
client.login(process.env.TEST);