import * as fs from 'fs';
import * as path from 'path';
import { getCollection } from '@/utils/CloudDB';
import { Collection } from 'mongodb';
import { Client, Guild } from 'discord.js';

export interface AntiRaidModule {
    getStatus?: (guildId: string) => unknown;
    getConfig?: (guildId: string) => { enabled: boolean; [key: string]: unknown };
    toggleModule?: (guildId: string, enabled: boolean) => Promise<void> | void;
    disable?: (guildId: string) => Promise<void> | void;
    shutdown?: () => Promise<void> | void;
    handleBotJoin?: (guild: Guild) => void;
    handleMemberJoin?: (member: unknown) => void;
    setClient?: (client: Client) => void;
}

export interface GuildSettingsCache {
    antiRaidEnabled: boolean;
    lastUpdated?: Date;
}

export interface AntiRaidDocument {
    guildId: string;
    antiRaidEnabled: boolean;
    lastUpdated?: Date;
    guildName?: string;
    createdAt?: Date;
}

class AntiRaidManager {
    public modules = new Map<string, AntiRaidModule>();
    public guildSettings = new Map<string, GuildSettingsCache>();
    public collection: Collection<AntiRaidDocument> | null = null;
    public client: Client | null = null;

    private syncInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.discoverModules();
        void this.initMongoDB();
        this.syncInterval = setInterval(() => { void this.syncMainSettings(); }, 60000);
        console.log('[AntiRaid] 🚀 Master system initialized');
    }

    private discoverModules(): void {
        try {
            const currentDir = __dirname;
            const files = fs.readdirSync(currentDir);

            const moduleFiles = files.filter(file =>
                (file.endsWith('.js') || file.endsWith('.ts')) &&
                file !== 'anti_raid.js' &&
                file !== 'anti_raid.ts' &&
                file !== 'analytics.js' &&
                file !== 'analytics.ts' &&
                !file.includes('test') &&
                !file.includes('example')
            );
            console.log(`[AntiRaid] 🔍 Discovered potential modules:`, moduleFiles);

            for (const file of moduleFiles) {
                try {
                    const modulePath = path.join(currentDir, file);
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const moduleExport = require(modulePath) as unknown;

                    if (this.isValidModule(moduleExport)) {
                        const moduleName = file.replace(/\.(js|ts)$/, '');
                        this.modules.set(moduleName, moduleExport as AntiRaidModule);
                        console.log(`[AntiRaid] ✅ Loaded module: ${moduleName}`);
                    } else {
                        console.log(`[AntiRaid] ⚠️ Skipped ${file} - NOT a valid anti-raid module`);
                    }
                } catch (error) {
                    console.error(`[AntiRaid] ❌ Failed to load ${file}:`, error instanceof Error ? error.message : String(error));
                }
            }

            console.log(`[AntiRaid] 📦 Total modules loaded: ${this.modules.size}`);

        } catch (error) {
            console.error('[AntiRaid] ❌ Module discovery failed:', error instanceof Error ? error.message : String(error));
        }
    }

    private isValidModule(moduleExport: unknown): boolean {
        if (!moduleExport || typeof moduleExport !== 'object') {
            return false;
        }

        const mod = moduleExport as Record<string, unknown>;
        return (
            typeof mod.getStatus === 'function' ||
            typeof mod.getConfig === 'function' ||
            typeof mod.handleBotJoin === 'function' ||
            typeof mod.handleMemberJoin === 'function'
        );
    }

    public async initMongoDB(): Promise<void> {
        try {
            this.collection = await getCollection<AntiRaidDocument>('antiraid_main_settings', 'antiraid');
            console.log('[AntiRaid] ✅ connected to MongoDB (shared pool)');
            await this.syncMainSettings();
        } catch (error) {
            console.error('[AntiRaid] ❌ MongoDB connection failed:', error instanceof Error ? error.message : String(error));
        }
    }

    public async syncMainSettings(): Promise<void> {
        if (this.collection === null) return;

        try {
            const dbSettings = await this.collection.find({}).toArray();

            for (const setting of dbSettings) {
                const guildId = setting.guildId;
                const cachedSetting = this.guildSettings.get(guildId);

                if (cachedSetting?.antiRaidEnabled !== setting.antiRaidEnabled) {
                    this.guildSettings.set(guildId, {
                        antiRaidEnabled: setting.antiRaidEnabled,
                        lastUpdated: setting.lastUpdated
                    });
                }
            }

        } catch (error) {
            console.error('[AntiRaid] ❌ Main settings sync failed:', error instanceof Error ? error.message : String(error));
        }
    }

    public isAntiRaidEnabled(guildId: string): boolean {
        const setting = this.guildSettings.get(guildId);
        return setting !== undefined ? setting.antiRaidEnabled : true;
    }

    public async toggleAntiRaid(guildId: string, enabled: boolean): Promise<boolean> {
        if (this.collection === null) {
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

            this.guildSettings.set(guildId, {
                antiRaidEnabled: enabled,
                lastUpdated: new Date()
            });

            return true;

        } catch (error) {
            console.error('[AntiRaid] ❌ Failed to toggle anti-raid:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    public getGuildStatus(guildId: string): Record<string, unknown> {
        const mainEnabled = this.isAntiRaidEnabled(guildId);
        const moduleStatuses: Record<string, unknown> = {};

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
                moduleStatuses[moduleName] = { enabled: 'error', error: error instanceof Error ? error.message : String(error) };
            }
        }

        return {
            antiRaidEnabled: mainEnabled,
            moduleCount: this.modules.size,
            modules: moduleStatuses,
            isConnectedToMongoDB: this.collection !== null
        };
    }

    public getLoadedModules(): string[] {
        return Array.from(this.modules.keys());
    }

    public async initializeGuild(guildId: string, guildName: string): Promise<void> {
        try {
            if (this.collection !== null) {
                await this.collection.updateOne(
                    { guildId },
                    {
                        $set: {
                            guildId,
                            guildName,
                            antiRaidEnabled: true,
                            createdAt: new Date(),
                            lastUpdated: new Date()
                        }
                    },
                    { upsert: true }
                );
            }
        } catch (error) {
            console.error('[AntiRaid] ❌ Failed to initialize guild:', error instanceof Error ? error.message : String(error));
        }
    }

    public async handleGuildJoin(guild: Guild): Promise<void> {
        await this.initializeGuild(guild.id, guild.name);
        console.log(`[AntiRaid] 🏠 Bot joined new guild: ${guild.name} (${guild.id})`);
    }

    public async handleGuildLeave(guild: Guild): Promise<void> {
        this.guildSettings.delete(guild.id);

        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.disable === 'function') {
                    const result = module.disable(guild.id);
                    if (result instanceof Promise) {
                        await result;
                    }
                }
            } catch (error) {
                console.error(`[AntiRaid] ❌ Error disabling ${moduleName} for guild ${guild.id}:`, error instanceof Error ? error.message : String(error));
            }
        }

        console.log(`[AntiRaid] 👋 Cleaned up settings for left guild: ${guild.name} (${guild.id})`);
    }

    public shouldModuleProcess(guildId: string, moduleName: string): boolean {
        const globalEnabled = this.isAntiRaidEnabled(guildId);

        if (!globalEnabled) {
            return false;
        }

        const module = this.modules.get(moduleName);
        if (module === undefined) return false;

        try {
            if (typeof module.getConfig === 'function') {
                const config = module.getConfig(guildId);
                return config.enabled;
            }
            return true;
        } catch (error) {
            console.error(`[AntiRaid] ❌ Error checking module ${moduleName} status:`, error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    public getFilteredGuildStatus(guildId: string): Record<string, unknown> {
        const globalEnabled = this.isAntiRaidEnabled(guildId);
        const moduleStatuses: Record<string, unknown> = {};

        for (const [moduleName, module] of this.modules) {
            const shouldProcess = this.shouldModuleProcess(guildId, moduleName);

            try {
                if (typeof module.getStatus === 'function') {
                    const status = module.getStatus(guildId);
                    moduleStatuses[moduleName] = {
                        ...(typeof status === 'object' && status !== null ? status : { status }),
                        shouldProcess,
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
                    error: error instanceof Error ? error.message : String(error)
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

    public async emergencyDisable(guildId: string): Promise<void> {
        console.log(`[AntiRaid] 🚨 EMERGENCY DISABLE for guild ${guildId}`);

        await this.toggleAntiRaid(guildId, false);

        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.toggleModule === 'function') {
                    const result = module.toggleModule(guildId, false);
                    if (result instanceof Promise) {
                        await result;
                    }
                } else if (typeof module.disable === 'function') {
                    const result = module.disable(guildId);
                    if (result instanceof Promise) {
                        await result;
                    }
                }
                console.log(`[AntiRaid] ✅ Emergency disabled ${moduleName}`);
            } catch (error) {
                console.error(`[AntiRaid] ❌ Failed to emergency disable ${moduleName}:`, error instanceof Error ? error.message : String(error));
            }
        }
    }

    public getSystemStats(): Record<string, unknown> {
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

    public setClient(client: Client): void {
        this.client = client;
        console.log('[AntiRaid] 🔗 Discord client reference set');

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
                console.error(`[AntiRaid] ❌ Failed to set client for ${moduleName}:`, error instanceof Error ? error.message : String(error));
            }
        }

        console.log(`[AntiRaid] 🤖 Discord client set for ${successCount}/${this.modules.size} modules`);

        if (this.client !== null && this.client.user !== null) {
            console.log(`[AntiRaid] ✅ Client verification successful - Bot: ${this.client.user.tag}`);
        } else {
            console.warn('[AntiRaid] ⚠️ Client set but verification failed - some features may not work');
        }
    }

    public async shutdown(): Promise<void> {
        console.log('[AntiRaid] killing :< master system...');

        if (this.syncInterval !== null) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        for (const [moduleName, module] of this.modules) {
            try {
                if (typeof module.shutdown === 'function') {
                    const result = module.shutdown();
                    if (result instanceof Promise) {
                        await result;
                    }
                    console.log(`[AntiRaid] shutdown ${moduleName}`);
                }
            } catch (error) {
                console.error(`[AntiRaid] Error shutting down ${moduleName}:`, error instanceof Error ? error.message : String(error));
            }
        }

        console.log('[AntiRaid] Master system shutdown complete');
    }
}

export default new AntiRaidManager();