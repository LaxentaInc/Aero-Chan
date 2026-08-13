import { getCollection } from "../../../utils/CloudDB";
import { EmbedBuilder, PermissionFlagsBits, Guild, GuildMember, User } from "discord.js";
import logManager from "../logManager";
import { BaseModule, ModuleConfig } from "../BaseModule";

export interface AgeVerifyConfig extends ModuleConfig {
    minAccountAge: number;
    action: 'kick' | 'ban' | 'timeout' | 'none';
    timeoutDuration: number;
    logChannelId: string | null;
    trustedUsers: string[];
    trustedRoles: string[];
    bypassTrusted: boolean;
    logActions: boolean;
    debug: boolean;
}

class AgeVerifyModule extends BaseModule<AgeVerifyConfig> {
    private collection: any = null;

    constructor() {
        super('account-age-protection');
        void this.initMongoDB();
        console.log(`[${this.moduleName}] Module initialized`);
    }

    private async initMongoDB() {
        try {
            this.collection = await getCollection('account_age_configs', 'antiraid');
            console.log(`[${this.moduleName}] ✅ connected to MongoDB (shared pool)`);
            await this.syncConfigs();
        } catch (error: any) {
            console.error(`[${this.moduleName}] ❌ MongoDB connection failed:`, error.message);
        }
    }

    public async syncConfigs(): Promise<void> {
        if (!this.collection) return;
        try {
            const dbConfigs = await this.collection.find({}).toArray();
            for (const dbConfig of dbConfigs) {
                const guildId = dbConfig.guildId;
                const cachedConfig = this.configs.get(guildId);
                
                if (!cachedConfig || JSON.stringify(cachedConfig) !== JSON.stringify(dbConfig.config)) {
                    this.setCache(guildId, dbConfig.config);
                    console.log(`[${this.moduleName}] 🔄 Config updated for guild ${guildId}`);
                }
            }
        } catch (error: any) {
            console.error(`[${this.moduleName}] ❌ Config sync failed:`, error.message);
        }
    }

    /**
     * Get configuration for a guild (with defaults)
     */
    public getConfig(guildId: string): AgeVerifyConfig {
        const cached = this.configs.get(guildId);

        // Default configuration
        const defaults: AgeVerifyConfig = {
            enabled: true,
            minAccountAge: 7,
            action: 'none',
            timeoutDuration: 600,
            logChannelId: null,
            trustedUsers: [],
            trustedRoles: [],
            bypassTrusted: true,
            logActions: true,
            debug: true
        };

        return cached ? { ...defaults, ...cached } : defaults;
    }

    /**
     * Update config in cache (Database updating is handled by AntiRaidManager)
     */
    public async updateConfig(guildId: string, newConfig: Partial<AgeVerifyConfig>): Promise<boolean> {
        const current = this.getConfig(guildId);
        const validated = this.validateConfig({ ...current, ...newConfig });
        this.setCache(guildId, validated);
        console.log(`[${this.moduleName}] ✅ Config updated in cache for guild ${guildId}`);
        // Note: The master AntiRaidManager is responsible for pushing this to MongoDB if called via API.
        return true;
    }

    /**
     * Validate configuration values
     */
    private validateConfig(config: any): AgeVerifyConfig {
        const validated = { ...config } as AgeVerifyConfig;

        if (validated.minAccountAge < 1) validated.minAccountAge = 1;
        if (validated.minAccountAge > 365) validated.minAccountAge = 365;

        const validActions = ['none', 'kick', 'ban', 'timeout'];
        if (!validActions.includes(validated.action)) {
            validated.action = 'none';
        }

        if (validated.timeoutDuration < 60) validated.timeoutDuration = 60;
        if (validated.timeoutDuration > 2419200) validated.timeoutDuration = 2419200; // 28 days max

        if (!Array.isArray(validated.trustedUsers)) validated.trustedUsers = [];
        if (!Array.isArray(validated.trustedRoles)) validated.trustedRoles = [];
        
        return validated;
    }

    /**
     * Handle new member join
     */
    public async handleMemberJoin(member: GuildMember) {
        if (member.user.bot) return;
        const guildId = member.guild.id;
        const config = this.getConfig(guildId);

        if (!config.enabled) {
            if (config.debug) console.log(`[${this.moduleName}] Skipping - module disabled for guild ${guildId}`);
            return;
        }

        const userData = {
            userId: member.user.id,
            username: member.user.username,
            userTag: member.user.tag,
            accountCreatedAt: member.user.createdTimestamp,
            accountAge: Date.now() - member.user.createdTimestamp,
            joinedAt: member.joinedTimestamp || Date.now(),
            hasAvatar: member.user.avatar !== null,
            guildId: guildId,
            guildName: member.guild.name
        };

        const shouldTakeAction = await this.shouldTakeAction(member, userData, config);
        
        if (shouldTakeAction.takeAction) {
            await this.handleYoungAccount(member, shouldTakeAction, config);
        } else {
            if (config.debug) {
                console.log(`[${this.moduleName}] ✅ User ${member.user.username} passed age check or is trusted`);
            }
        }
    }

    /**
     * Determine if action should be taken against the user
     */
    private async shouldTakeAction(member: GuildMember, userData: any, config: AgeVerifyConfig) {
        const accountAgeDays = userData.accountAge / (1000 * 60 * 60 * 24);
        const reasons: string[] = [];

        if (config.bypassTrusted && this.isTrustedUser(member.user, member.guild, config)) {
            return {
                takeAction: false,
                reason: 'Trusted user bypass',
                accountAgeDays: Math.round(accountAgeDays)
            };
        }

        if (accountAgeDays < config.minAccountAge) {
            reasons.push(`Account too young (${Math.round(accountAgeDays)}d < ${config.minAccountAge}d)`);
            return {
                takeAction: true,
                reasons,
                accountAgeDays: Math.round(accountAgeDays),
                action: config.action,
                analysis: {
                    accountAgeDays: Math.round(accountAgeDays),
                    minRequired: config.minAccountAge,
                    hasAvatar: userData.hasAvatar,
                    isTrusted: this.isTrustedUser(member.user, member.guild, config)
                }
            };
        }
        
        return {
            takeAction: false,
            reason: 'Account age acceptable',
            accountAgeDays: Math.round(accountAgeDays)
        };
    }

    /**
     * Handle young account detection
     */
    private async handleYoungAccount(member: GuildMember, actionData: any, config: AgeVerifyConfig) {
        const guild = member.guild;
        const user = member.user;
        try {
            let actionTaken = false;
            let actionResult = 'No action taken';

            if (config.action !== 'none') {
                switch (config.action) {
                    case 'kick':
                        await member.kick(`Account too young (${actionData.accountAgeDays}d < ${config.minAccountAge}d)`);
                        actionTaken = true;
                        actionResult = 'User kicked';
                        break;
                    case 'ban':
                        await member.ban({
                            reason: `Account too young (${actionData.accountAgeDays}d < ${config.minAccountAge}d)`,
                            deleteMessageSeconds: 0
                        });
                        actionTaken = true;
                        actionResult = 'User banned';
                        break;
                    case 'timeout':
                        await member.timeout(config.timeoutDuration * 1000, `Account too young (${actionData.accountAgeDays}d < ${config.minAccountAge}d)`);
                        actionTaken = true;
                        actionResult = `User timed out for ${config.timeoutDuration}s`;
                        break;
                    default:
                        actionResult = 'Unknown action - no action taken';
                }
            }

            const actionColors: Record<string, number> = {
                'none': 0xF1C40F,
                'kick': 0xE74C3C,
                'ban': 0x8B0000,
                'timeout': 0xFF8800
            };
            
            const alertEmbed = new EmbedBuilder()
                .setColor(actionColors[config.action] || 0xF1C40F)
                .setTitle(`<:warning:1422451081224392816> Young Account Detected`)
                .setThumbnail(user.displayAvatarURL({ forceStatic: false, size: 256 }))
                .setDescription(`**${user.username}** joined with a suspiciously young account.`)
                .addFields(
                    { name: '<:timeout:1422451090259181568> User', value: `${user} (\`${user.id}\`)`, inline: true },
                    { name: '📅 Account Age', value: `**${actionData.accountAgeDays}** days (min: ${config.minAccountAge})`, inline: true },
                    { name: '📆 Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '⚡ Action Taken', value: actionResult, inline: true },
                    { name: '🖼️ Avatar', value: actionData.analysis?.hasAvatar ? 'Yes' : 'No', inline: true },
                    ...(config.action === 'timeout' ? [{ name: '⏰ Timeout Duration', value: `${config.timeoutDuration}s`, inline: true }] : [])
                )
                .setFooter({ text: 'Account Age Verification | /dashboard to configure' })
                .setTimestamp();

            if (actionData.reasons?.length > 0) {
                alertEmbed.addFields({ name: '⚠️ Reason', value: actionData.reasons.join('\n'), inline: false });
            }

            await logManager.log(guild, actionTaken ? 'ACCOUNT_ACTION' : 'YOUNG_ACCOUNT', {
                target: user,
                description: `Young account detected: **${user.username}** (${actionData.accountAgeDays}d old)`,
                fields: [
                    { name: '📅 Account Age', value: `${actionData.accountAgeDays} days (min: ${config.minAccountAge})`, inline: true },
                    { name: '📆 Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '⚡ Action', value: actionResult, inline: false }
                ]
            });

            await this.notifyAdmins(guild, alertEmbed);
            await this.notifyOwner(guild, user, actionData, config, actionResult, alertEmbed);
            
        } catch (error: any) {
            console.error(`[${this.moduleName}] error handling young account:`, error.message);
        }
    }

    /**
     * Check if user is trusted (owner or in trusted list)
     */
    private isTrustedUser(user: User, guild: Guild, config: AgeVerifyConfig) {
        if (user.id === guild.ownerId) return true;
        if (config.trustedUsers.includes(user.id)) return true;

        const member = guild.members.cache.get(user.id);
        if (member && config.trustedRoles.some((roleId) => member.roles.cache.has(roleId))) {
            return true;
        }
        return false;
    }

    /**
     * notify server admins about the young account in the log channel
     */
    private async notifyAdmins(guild: Guild, alertEmbed: EmbedBuilder) {
        try {
            const alertChannel = await logManager.getAlertChannel(guild);
            if (!alertChannel) return;

            const adminMentions: string[] = [];
            try {
                const members = guild.members.cache.filter((m) => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator) && m.id !== guild.ownerId);
                members.forEach((m) => adminMentions.push(`<@${m.id}>`));
            } catch (e: any) {}
            
            const pingText = adminMentions.length > 0 ? `**Server admins:** ${adminMentions.slice(0, 5).join(', ')}` : null;
            await alertChannel.send({ content: pingText || undefined, embeds: [alertEmbed] });
        } catch (error: any) {
            console.error(`[${this.moduleName}] failed to notify admins:`, error.message);
        }
    }

    /**
     * notify server owner via dm
     */
    private async notifyOwner(guild: Guild, user: User, actionData: any, config: AgeVerifyConfig, actionResult: string, alertEmbed: EmbedBuilder) {
        try {
            const owner = await guild.fetchOwner();
            if (!owner) return;

            const dmEmbed = new EmbedBuilder(alertEmbed.data)
                .setTitle(`<:warning:1422451081224392816> Young Account Alert — ${guild.name}`)
                .setDescription(`A young account was detected in **${guild.name}**.`)
                .setFooter({ text: 'Account Age Verification | Configure via /dashboard' });
                
            await owner.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (error: any) {}
    }
}

export default new AgeVerifyModule();
