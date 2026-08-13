// entry file
const bootStartTime = performance.now();
const os = require('os');
const { Client, GatewayIntentBits, Partials, Options, Collection } = require('discord.js');
const { loadAllCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const {
    syncAllGuilds,
    syncSingleGuild,
    removeGuildFromDB,
    startGuildSync,
    stopGuildSync
} = require('./src/handlers/guildSync');
const { logger } = require('./src/utils/logger');
const { updateBotStatus } = require('./src/utils/status');
const { getClient, closeConnection } = require('./src/utils/CloudDB');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// configure global axios default headers so all outgoing http requests from commands (e.g. nekos.best anime gifs across 60+ commands) automatically include a valid user-agent.
// nekos.best security rules block requests without a user-agent header with a 403 forbidden error.
axios.defaults.headers.common['User-Agent'] = 'AeroBot/1.0 (https://discord.gg/yourserver; contact@aero.bot)';

// Define Models for Caching
const afkSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    reason: String,
    timestamp: { type: Date, default: Date.now, expires: 86400 }
});
const AFK = mongoose.models.AFK || mongoose.model('AFK', afkSchema);

const guildPrefixSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
});
const GuildPrefix = mongoose.models.GuildPrefix || mongoose.model('GuildPrefix', guildPrefixSchema);


// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    logger.error('unhandled Promise Rejection:', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise
    });
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    logger.error('uncaught Exception:', {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name
    });
    // process.exit(1);
});

if (!process.env.DISCORD_TOKEN) {
    logger.error("❌ DISCORD_TOKEN is not defined in environment variables. Exiting...");
    process.exit(1);
}

let client;
let statusCleanup;

async function initializeBot() {
    try {
        logger.info("🚀 Starting bot initialization...");

        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.AutoModerationExecution,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildExpressions
            ],
            partials: [Partials.Channel],
            makeCache: Options.cacheWithLimits({
                ...Options.defaultMakeCacheSettings,
                MessageManager: 25, // Drastically reduce message cache (25 per channel)
                PresenceManager: 0, // Disable presence caching (huge memory saver)
                GuildMemberManager: {
                    maxSize: 200,
                    keepOverLimit: member => member.id === client.user.id
                },
                UserManager: 200, // Limit user cache
                VoiceStateManager: Infinity, // Required for Lavalink/Voice features
                ThreadManager: 0, // Disable thread caching if not needed
                GuildEmojiManager: 0, // Fetch emojis when needed
                GuildStickerManager: 0,
                ReactionManager: 0,
                GuildScheduledEventManager: 0,
                StageInstanceManager: 0,
                GuildInviteManager: 0
            })
        });

        // initialize shared mongodb pool (one client for everything)
        const mongoClient = await getClient();
        logger.info('✅ shared MongoDB pool connected');

        try {
            const mongooseUri = process.env.MONGODB_URI || process.env.MONGO_URI;
            if (mongooseUri) {
                await mongoose.connect(mongooseUri);
                logger.info('✅ Mongoose connected');
            }
        } catch (err) {
            logger.error('❌ Mongoose connection failed:', err);
        }

        // Initialize anti-raid system early
        const antiRaid = require('./src/modules/anti_raid');
        (antiRaid.default || antiRaid).setClient(client);
        logger.info("Anti-raid system initialized");

        client.prefixCommands = new Map();
        client.slashCommands = new Map();
        client.pendingAuth = new Map();

        // Caches
        client.afkCache = new Collection();
        client.prefixCache = new Map();

        // Load Events
        await loadEvents(client);

        client.on('error', err => {
            logger.error('🚨 [Client Error]:', {
                message: err.message,
                stack: err.stack
            });
        });

        client.on('warn', warning => {
            logger.warn('⚠️ [Client Warning]:', warning);
        });

        // Guild join/leave events for real-time sync
        client.on('guildCreate', async (guild) => {
            logger.info(`Bot joined guild: ${guild.name} (${guild.id})`);
            await syncSingleGuild(guild, mongoClient);
        });

        client.on('guildDelete', async (guild) => {
            if (!guild.available && guild.name === undefined) {
                // This is a Discord server outage, not a kick. Don't wipe the database!
                return;
            }
            logger.info(`Bot left guild: ${guild.name} (${guild.id})`);
            await removeGuildFromDB(guild.id, mongoClient);
        });

        client.once('ready', async () => {
            try {
                logger.info(`${client.user.tag} is online!`);
                logger.info(`📊 Connected to ${client.guilds.cache.size} guilds`);

                // --- CACHE PRE-LOADING (PERFORMANCE) ---
                logger.info('🔄 Pre-loading caches...');
                const startLoad = Date.now();

                // Load AFK Cache
                const allAfk = await AFK.find({});
                allAfk.forEach(doc => client.afkCache.set(`${doc.guildId}-${doc.userId}`, doc));

                // Load Prefix Cache
                const allPrefixes = await GuildPrefix.find({});
                allPrefixes.forEach(doc => client.prefixCache.set(doc.guildId, doc.prefix));

                logger.info(`✅ Caches loaded in ${Date.now() - startLoad}ms | AFK: ${allAfk.length}, Prefixes: ${allPrefixes.length}`);

                // Periodic Cache Refresh (every 1 hour)
                setInterval(async () => {
                    try {
                        const freshAfk = await AFK.find({});
                        client.afkCache.clear();
                        freshAfk.forEach(doc => client.afkCache.set(`${doc.guildId}-${doc.userId}`, doc));

                        const freshPrefixes = await GuildPrefix.find({});
                        client.prefixCache.clear();
                        freshPrefixes.forEach(doc => client.prefixCache.set(doc.guildId, doc.prefix));
                        // logger.info('🔄 Caches refreshed via interval.'); // Optional log
                    } catch (e) {
                        logger.error('❌ Cache refresh failed:', e);
                    }
                }, 3600000);
                // ---------------------------------------

                // Initialize Lavalink now that client.user exists
                try {
                    logger.info("Initializing Lavalink...");
                    const lavalinkInit = require('./src/handlers/lavalink');
                    (lavalinkInit.default || lavalinkInit)(client);
                    logger.info("✅ Lavalink initialized successfully");
                } catch (err) {
                    logger.error("❌ Failed to initialize Lavalink:", {
                        message: err?.message || String(err),
                        stack: err?.stack,
                        name: err?.name
                    });
                    console.error('[Lavalink Init Error]:', err);
                }

                const preCmdTime = performance.now();
                await loadAllCommands(client);
                logger.info(`⏱️ [Boot Trace] loadAllCommands took ${((performance.now() - preCmdTime) / 1000).toFixed(2)}s`);
                logger.info(`📝 Prefix commands loaded: ${client.prefixCommands.size}`);
                logger.info(`⚡ Slash commands loaded: ${client.slashCommands.size}`);

                statusCleanup = updateBotStatus(client, client.manager);
                logger.info("📡 Status rotation started");

                // Initial guild sync (Run in background so it doesn't block boot)
                const preSyncTime = performance.now();
                syncAllGuilds(client, mongoClient).then(() => {
                    logger.info(`⏱️ [Boot Trace] Background syncAllGuilds finished in ${((performance.now() - preSyncTime) / 1000).toFixed(2)}s`);
                }).catch(err => logger.error('Background sync failed:', err));

                // Start periodic sync (every 30 minutes)
                startGuildSync(client, mongoClient);

                // Initialize quote cleanup
                try {
                    const { cleanupExpiredQuotes } = require('./src/handlers/quote/storage');
                    await cleanupExpiredQuotes(client);
                    // Run cleanup daily
                    setInterval(() => cleanupExpiredQuotes(client), 24 * 60 * 60 * 1000);
                    logger.info('✅ Quote cleanup initialized');
                } catch (err) {
                    logger.warn('Quote handler not found or failed to initialize');
                }

                // Initialize timer restoration
                try {
                    const { restoreTimers } = require('./src/utils/timerRestore');
                    await restoreTimers(client);
                    logger.info('✅ Timers restored');
                } catch (err) {
                    logger.warn('Timer restoration failed:', err.message);
                }

                const bootEndTime = performance.now();
                logger.info(`✅ Bot fully initialized and ready in ${((bootEndTime - bootStartTime) / 1000).toFixed(2)} seconds!`);
                
                // --- SYSTEM TELEMETRY ---
                const memory = process.memoryUsage();
                const memUsed = Math.round(memory.rss / 1024 / 1024);
                let priority = 'Unknown';
                try {
                    priority = os.getPriority(process.pid);
                } catch (e) {}
                
                logger.info(`📊 [System Telemetry] RAM: ${memUsed}MB | CPU: ${os.cpus().length} Cores | OS Priority: ${priority} | Discord API Ping: ${client.ws.ping}ms`);
                // ------------------------

            } catch (error) {
                logger.error('Error during ready event:', {
                    message: error?.message || String(error),
                    stack: error?.stack
                });
            }
        });

        client.on('disconnect', () => {
            logger.warn('Bot disconnected from Discord');
        });

        client.on('reconnecting', () => {
            logger.info('Bot reconnecting to Discord...');
        });

        logger.info("Logging in to Discord...");
        await client.login(process.env.DISCORD_TOKEN);
        logger.info("Login successful, waiting for ready event...");

    } catch (error) {
        console.error('[Init Error]:', error);
        logger.error('Critical error during bot initialization:', {
            message: error?.message || String(error),
            stack: error?.stack,
            code: error?.code,
            name: error?.name
        });

        if (statusCleanup) {
            try {
                statusCleanup();
            } catch (cleanupErr) {
                logger.error('Error during cleanup:', cleanupErr?.message || String(cleanupErr));
            }
        }

        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    logger.info('Shutting down...');

    stopGuildSync();

    // close shared mongodb pool
    closeConnection().catch(err => logger.error('error closing MongoDB:', err.message));

    if (statusCleanup) {
        logger.info('Cleaning up status rotation...');
        try { statusCleanup(); } catch (e) { }
    }

    if (client) {
        logger.info('Destroying client...');
        client.destroy();
    }

    logger.info('shutdown complete');
    process.exit(0);
}

initializeBot().catch(error => {
    logger.error('Fatal error starting bot:', {
        message: error.message,
        stack: error.stack
    });
    process.exit(1);
});


// Guild Sync Logic: Moved to src/handlers/guildSync.js
// Event Loading: Moved to src/handlers/eventHandler.js
// Cleaned index.js: Now it's just a clean entry point that initializes the bot and calls these handlers.