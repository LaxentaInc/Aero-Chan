import { GuildMember, EmbedBuilder, PermissionFlagsBits, Guild } from "discord.js";
import logManager from "../logManager";
import { BaseModule, ModuleConfig } from "../BaseModule";
import { getCollection } from "../../../utils/CloudDB";

export interface MassJoinConfig extends ModuleConfig {
    joinsLimit: number; // Max joins
    timeWindow: number; // In seconds
    action: 'kick' | 'ban' | 'none';
    notifyOwner: boolean;
}

class MassJoinModule extends BaseModule<MassJoinConfig> {
    private collection: any = null;
    
    // Tracking cache: guildId -> array of join timestamps
    private joinHistory: Map<string, number[]> = new Map();

    constructor() {
        super('mass-join-protection');
        void this.initMongoDB();
        console.log(`[${this.moduleName}] Module initialized`);
    }

    private async initMongoDB() {
        try {
            this.collection = await getCollection('mass_join_configs', 'antiraid');
            await this.syncConfigs();
        } catch (error: any) {
            console.error(`[${this.moduleName}] MongoDB connection failed:`, error.message);
        }
    }

    public async syncConfigs(): Promise<void> {
        if (!this.collection) return;
        try {
            const dbConfigs = await this.collection.find({}).toArray();
            for (const dbConfig of dbConfigs) {
                this.setCache(dbConfig.guildId, dbConfig.config);
            }
        } catch (error: any) {}
    }

    public getConfig(guildId: string): MassJoinConfig {
        const cached = this.configs.get(guildId);
        const defaults: MassJoinConfig = {
            enabled: true,
            joinsLimit: 10,
            timeWindow: 10,
            action: 'kick',
            notifyOwner: true
        };
        return cached ? { ...defaults, ...cached } : defaults;
    }

    public async updateConfig(guildId: string, newConfig: Partial<MassJoinConfig>): Promise<boolean> {
        const current = this.getConfig(guildId);
        const validated = { ...current, ...newConfig } as MassJoinConfig;
        this.setCache(guildId, validated);
        return true;
    }

    public async handleMemberJoin(member: GuildMember) {
        const guild = member.guild;
        const config = this.getConfig(guild.id);
        
        if (!config.enabled) return;

        const now = Date.now();
        const history = this.joinHistory.get(guild.id) || [];
        
        // Filter out old joins outside the time window
        const windowMs = config.timeWindow * 1000;
        const recentJoins = history.filter(time => now - time < windowMs);
        recentJoins.push(now);
        this.joinHistory.set(guild.id, recentJoins);

        // Check if limit exceeded
        if (recentJoins.length > config.joinsLimit) {
            await this.triggerLockdown(member, config, recentJoins.length);
        }
    }

    private async triggerLockdown(member: GuildMember, config: MassJoinConfig, count: number) {
        const guild = member.guild;
        
        // Prevent duplicate lockdown actions within a short time
        const key = `lockdown-${guild.id}`;
        if (this.joinHistory.has(key)) return;
        this.joinHistory.set(key, [Date.now()]);
        setTimeout(() => this.joinHistory.delete(key), 60000); // 1 minute cooldown on alerts

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🚨 Mass Join Detected!')
            .setDescription(`Detected **${count}** joins in the last **${config.timeWindow}** seconds.`)
            .addFields(
                { name: 'Action Taken', value: config.action.toUpperCase(), inline: true },
                { name: 'Threshold', value: `${config.joinsLimit} joins / ${config.timeWindow}s`, inline: true }
            )
            .setTimestamp();

        await logManager.logAlert(guild, { embed });

        if (config.notifyOwner) {
            try {
                const owner = await guild.fetchOwner();
                await owner.send({ embeds: [embed] }).catch(() => {});
            } catch (e: any) {}
        }
        
        if (config.action === 'kick') {
            await member.kick('Mass Join Protection Triggered').catch(() => {});
        } else if (config.action === 'ban') {
            await member.ban({ reason: 'Mass Join Protection Triggered' }).catch(() => {});
        }
    }
}

export default new MassJoinModule();
