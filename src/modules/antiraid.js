/*
=== ANTI-RAID MASTER MODULE ===
Automatically discovers and manages all anti-raid modules.
Each module handles its own MongoDB config and enable/disable logic.

This file just:
- Auto-discovers modules in the same folder
- Initializes them for all guilds
- Provides a unified interface for status/control
- Handles the main anti-raid enable/disable toggle

USAGE:
const AntiRaid = require('./antiraid');
const antiRaid = new AntiRaid();

// That's it! It automatically finds and manages all modules ;3
*/

const fs = require('fs');
const path = require('path');
const { getCollection } = require('../utils/CloudDB');


class AntiRaidManager {
    constructor() {
        this.modules = new Map(); // moduleName -> module instance
        this.guildSettings = new Map(); // guildId -> { antiRaidEnabled: boolean }
        this.mongoClient = null;
        this.db = null;
        this.collection = null;

        // Auto-discover and load modules
        this.discoverModules();

        // Initialize MongoDB for main anti-raid settings
        this.initMongoDB();

        // Sync main settings every 10 seconds
        // sync every 60s instead of 10s — reduces db load by ~80%
        this.syncInterval = setInterval(() => this.syncMainSettings(), 60000);

        console.log('[AntiRaid] 🚀 Master system initialized');
    }

    /**
     * Auto-discover all module files in the same directory
     */
    discoverModules() {
        try {
            const currentDir = __dirname;
            const files = fs.readdirSync(currentDir);

            // Look for module files (exclude this file and non-JS files)
            const moduleFiles = files.filter(file =>
                file.endsWith('.js') &&
                file !== 'antiraid.js' &&
                file !== 'analytics.js' &&
                !file.includes('test') &&
                !file.includes('example')
            );
            // analytics and antiraids are excluded because they are not anti-raid modules themselves e  
            console.log(`[AntiRaid] 🔍 Discovered potential modules:`, moduleFiles);

            for (const file of moduleFiles) {
                try {
                    const modulePath = path.join(currentDir, file);
                    const moduleExport = require(modulePath);

                    // Check if it's a valid anti-raid module
                    if (this.isValidModule(moduleExport)) {
                        // Keep original filename (without .js) as module name
                        const moduleName = file.replace('.js', '');
                        this.modules.set(moduleName, moduleExport);
                        console.log(`[AntiRaid] ✅ Loaded module: ${moduleName}`);
                    } else {
                        console.log(`[AntiRaid] ⚠️ Skipped ${file} - NOT a valid anti-raid module`);
                    }
                } catch (error) {
                    console.error(`[AntiRaid] ❌ Failed to load ${file}:`, error.message);
                }
            }

            console.log(`[AntiRaid] 📦 Total modules loaded: ${this.modules.size}`);

        } catch (error) {
            console.error('[AntiRaid] ❌ Module discovery failed:', error.message);
        }
    }

    /**
     * Check if a module export is a valid anti-raid module
     */
    isValidModule(moduleExport) {
        // Check if it has the expected methods/properties
        return (
            moduleExport &&
            typeof moduleExport === 'object' &&
            (
                typeof moduleExport.getStatus === 'function' ||
                typeof moduleExport.getConfig === 'function' ||
                typeof moduleExport.handleBotJoin === 'function' ||
                typeof moduleExport.handleMemberJoin === 'function'
            )
        );
    }

    /**
     * Initialize MongoDB for main anti-raid settings
     */
    async initMongoDB() {
        try {
            this.collection = await getCollection('antiraid_main_settings', 'antiraid');
            console.log('[AntiRaid] ✅ connected to MongoDB (shared pool)');

            // initial sync
            await this.syncMainSettings();

        } catch (error) {
            console.error('[AntiRaid] ❌ MongoDB connection failed:', error.message);
        }
    }

    /**
     * Sync main anti-raid settings from MongoDB
     */
    async syncMainSettings() {
        if (!this.collection) return;

        try {
            const dbSettings = await this.collection.find({}).toArray();

            for (const setting of dbSettings) {
                const guildId = setting.guildId;
                const cachedSetting = this.guildSettings.get(guildId);

                // Check if setting changed
                if (!cachedSetting || cachedSetting.antiRaidEnabled !== setting.antiRaidEnabled) {
                    this.guildSettings.set(guildId, {
                        antiRaidEnabled: setting.antiRaidEnabled,
                        lastUpdated: setting.lastUpdated
                    });

                    // console.log(`[AntiRaid] 🔄 Main settings updated for guild ${guildId}: antiRaidEnabled = ${setting.antiRaidEnabled}`);
                }
            }

        } catch (error) {
            console.error('[AntiRaid] ❌ Main settings sync failed:', error.message);
        }
    }

    /**
     * Check if anti-raid is enabled for a guild
     */
    isAntiRaidEnabled(guildId) {
        const setting = this.guildSettings.get(guildId);
        return setting ? setting.antiRaidEnabled : true; // Default to enabled
    }

    /**
     * Toggle anti-raid for a guild
     */
    async toggleAntiRaid(guildId, enabled) {
        if (!this.collection) {
            console.error('[AntiRaid] ❌ Cannot toggle - no MongoDB connection');
            return false;
        }

        try {
            await this.collection.updateOne(
                { guildId },
                {
                    $set: {
                        guildId,
                        antiRaidEnabled: enabled,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            // Update cache immediately
            this.guildSettings.set(guildId, {
                antiRaidEnabled: enabled,
                lastUpdated: new Date()
            });

            // console.log(`[AntiRaid] ✅ Anti-raid ${enabled ? 'enabled' : 'disabled'} for guild ${guildId}`);
            return true;

        } catch (error) {
            console.error('[AntiRaid] ❌ Failed to toggle anti-raid:', error.message);
            return false;
        }
    }

    /**
     * Get comprehensive status for a guild
     */
    getGuildStatus(guildId) {
        const mainEnabled = this.isAntiRaidEnabled(guildId);
        const moduleStatuses = {};

        // Get status from each module
        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.getStatus === 'function') {
                    moduleStatuses[moduleName] = module.getStatus(guildId);
                } else if (typeof module.getConfig === 'function') {
                    const config = module.getConfig(guildId);
                    moduleStatuses[moduleName] = {
                        enabled: config.enabled,
                        config: config
                    };
                } else {
                    moduleStatuses[moduleName] = { enabled: 'unknown', error: 'No status method' };
                }
            } catch (error) {
                moduleStatuses[moduleName] = { enabled: 'error', error: error.message };
            }
        }

        return {
            antiRaidEnabled: mainEnabled,
            moduleCount: this.modules.size,
            modules: moduleStatuses,
            isConnectedToMongoDB: this.collection !== null
        };
    }

    /**
     * Get list of all loaded modules
     */
    getLoadedModules() {
        return Array.from(this.modules.keys());
    }

    /**
     * Initialize default settings for a new guild
     */
    async initializeGuild(guildId, guildName) {
        try {
            // Create default main setting
            if (this.collection) {
                await this.collection.updateOne(
                    { guildId },
                    {
                        $set: {
                            guildId,
                            guildName,
                            antiRaidEnabled: true, //IMPORTANT DEFAULT ENABLED- WHIC ENABLED ALL MODULES
                            createdAt: new Date(),
                            lastUpdated: new Date()
                        }
                    },
                    { upsert: true }
                );
            }

            // Each module will create its own default config when it detects a new guild
            // console.log(`[AntiRaid] ✅ Initialized settings for new guild: ${guildName} (${guildId})`);

        } catch (error) {
            console.error('[AntiRaid] ❌ Failed to initialize guild:', error.message);
        }
    }

    /**
     * Handle new guild join
     */
    async handleGuildJoin(guild) {
        await this.initializeGuild(guild.id, guild.name);
        console.log(`[AntiRaid] 🏠 Bot joined new guild: ${guild.name} (${guild.id})`);
    }

    /**
     * Handle guild leave
     */
    async handleGuildLeave(guild) {
        // Clean up cached settings
        this.guildSettings.delete(guild.id);

        // Each module should handle its own cleanup
        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.disable === 'function') {
                    await module.disable(guild.id);
                }
            } catch (error) {
                console.error(`[AntiRaid] ❌ Error disabling ${moduleName} for guild ${guild.id}:`, error.message);
            }
        }

        console.log(`[AntiRaid] 👋 Cleaned up settings for left guild: ${guild.name} (${guild.id})`);
    }



    // here
    /**
    * Check if a module should process events for a guild
    */
    shouldModuleProcess(guildId, moduleName) {
        const globalEnabled = this.isAntiRaidEnabled(guildId);

        if (!globalEnabled) {
            return false; // Global anti-raid is off - STOP ALL MODULES
        }

        // Global is on, check if module is individually enabled
        const module = this.modules.get(moduleName);
        if (!module) return false;

        try {
            if (typeof module.getConfig === 'function') {
                const config = module.getConfig(guildId);
                return config.enabled; // Return module's individual toggle
            }
            return true; // If module has no config, assume enabled
        } catch (error) {
            console.error(`[AntiRaid] ❌ Error checking module ${moduleName} status:`, error.message);
            return false;
        }
    }

    /**
     * Get filtered module status (respecting global toggle)
     */
    getFilteredGuildStatus(guildId) {
        const globalEnabled = this.isAntiRaidEnabled(guildId);
        const moduleStatuses = {};

        for (const [moduleName, module] of this.modules) {
            const shouldProcess = this.shouldModuleProcess(guildId, moduleName);

            try {
                if (typeof module.getStatus === 'function') {
                    const status = module.getStatus(guildId);
                    moduleStatuses[moduleName] = {
                        ...status,
                        shouldProcess, // This is the key field!
                        effectivelyEnabled: shouldProcess
                    };
                } else {
                    moduleStatuses[moduleName] = {
                        shouldProcess,
                        effectivelyEnabled: shouldProcess,
                        error: 'No status method'
                    };
                }
            } catch (error) {
                moduleStatuses[moduleName] = {
                    shouldProcess: false,
                    effectivelyEnabled: false,
                    error: error.message
                };
            }
        }

        return {
            antiRaidEnabled: globalEnabled,
            moduleCount: this.modules.size,
            modules: moduleStatuses,
            isConnectedToMongoDB: this.collection !== null
        };
    }
    /**
     * Emergency disable all modules for a guild
     */
    async emergencyDisable(guildId) {
        console.log(`[AntiRaid] 🚨 EMERGENCY DISABLE for guild ${guildId}`);

        // Disable main anti-raid
        await this.toggleAntiRaid(guildId, false);

        // Try to disable all modules
        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.toggleModule === 'function') {
                    await module.toggleModule(guildId, false);
                } else if (typeof module.disable === 'function') {
                    await module.disable(guildId);
                }
                console.log(`[AntiRaid] ✅ Emergency disabled ${moduleName}`);
            } catch (error) {
                console.error(`[AntiRaid] ❌ Failed to emergency disable ${moduleName}:`, error.message);
            }
        }
    }

    /**
     * Get system-wide statistics
     */
    getSystemStats() {
        const totalGuilds = this.guildSettings.size;
        const enabledGuilds = Array.from(this.guildSettings.values()).filter(s => s.antiRaidEnabled).length;

        return {
            totalModules: this.modules.size,
            moduleNames: this.getLoadedModules(),
            totalGuilds,
            enabledGuilds,
            disabledGuilds: totalGuilds - enabledGuilds,
            mongoConnected: this.collection !== null
        };
    }

    /**
     * Set Discord client reference for all modules
     * Call this in your main bot's ready event
     */
    setClient(client) {
        if (!client) {
            console.error('[AntiRaid] ❌ Attempted to set null/undefined client');
            return;
        }

        this.client = client;
        console.log('[AntiRaid] 🔗 Discord client reference set');

        // Pass client to all loaded modules
        let successCount = 0;
        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.setClient === 'function') {
                    module.setClient(client);
                    console.log(`[AntiRaid] ✅ Client set for ${moduleName}`);
                    successCount++;
                } else {
                    console.log(`[AntiRaid] ⚠️ Module ${moduleName} has no setClient method`);
                }
            } catch (error) {
                console.error(`[AntiRaid] ❌ Failed to set client for ${moduleName}:`, error.message);
            }
        }

        console.log(`[AntiRaid] 🤖 Discord client set for ${successCount}/${this.modules.size} modules`);

        // Verify client is properly set
        if (this.client && this.client.user) {
            console.log(`[AntiRaid] ✅ Client verification successful - Bot: ${this.client.user.tag}`);
        } else {
            console.warn('[AntiRaid] ⚠️ Client set but verification failed - some features may not work');
        }
    }

    /**
     * shutdown
     */
    async shutdown() {
        console.log('[AntiRaid] killing :< master system...');

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.shutdown === 'function') {
                    await module.shutdown();
                    console.log(`[AntiRaid] shutdown ${moduleName}`);
                }
            } catch (error) {
                console.error(`[AntiRaid] Error shutting down ${moduleName}:`, error.message);
            }
        }


        console.log('[AntiRaid] Master system shutdown complete');
    }
}

// Export singleton instance
module.exports = new AntiRaidManager();

// // ANY MODULES OF ANTIRAID SHALL FOLLOW THIS STRICTLY etc:
// class YourModule {
//     getStatus(guildId) { /* return status */ }
//     getConfig(guildId) { /* return config */ }
//     toggleModule(guildId, enabled) { /* enable/disable */ }
//     shutdown() { /* cleanup */ }
// }
// THEY NEED TO FLLOW THIS STRUCTURE TO BE AUTO-LOADED BY ANTIRAID.JS AND CONDISERED AS A ANTI RAID MODULE OR THEY ARE INVALID