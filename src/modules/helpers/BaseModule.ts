export interface ModuleConfig {
    enabled: boolean;
    [key: string]: any;
}

export interface ModuleStatus {
    moduleName: string;
    enabled: boolean;
    config: ModuleConfig;
    [key: string]: any;
}

export abstract class BaseModule<T extends ModuleConfig = ModuleConfig> {
    public moduleName: string;
    protected configs: Map<string, T> = new Map();

    constructor(moduleName: string) {
        this.moduleName = moduleName;
    }

    /**
     * Get the current configuration for a guild.
     */
    public abstract getConfig(guildId: string): T;

    /**
     * Update the configuration for a guild.
     */
    public abstract updateConfig(guildId: string, newConfig: Partial<T>): Promise<boolean>;

    /**
     * Sync configurations from the database.
     * Called periodically by the AntiRaidManager.
     */
    public abstract syncConfigs(): Promise<void>;

    /**
     * Get the status of the module for a guild.
     */
    public getStatus(guildId: string): ModuleStatus {
        const config = this.getConfig(guildId);
        return {
            moduleName: this.moduleName,
            enabled: config.enabled,
            config
        };
    }

    /**
     * Set a configuration directly into the cache. 
     * Usually called by the AntiRaidManager when syncing from DB.
     */
    public setCache(guildId: string, config: T): void {
        this.configs.set(guildId, config);
    }
    
    /**
     * Delete a configuration from the cache (e.g. when bot leaves a guild).
     */
    public clearCache(guildId: string): void {
        this.configs.delete(guildId);
    }

    /**
     * Enable or disable the module for testing/emergencies.
     */
    public async toggleModule(guildId: string, enabled: boolean): Promise<boolean> {
        return this.updateConfig(guildId, { enabled } as Partial<T>);
    }
}
