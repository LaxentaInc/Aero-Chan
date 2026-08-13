import { getDefaultConfig, DANGEROUS_PERMISSIONS, getPermissionName } from "./config";
import { ExtendedClient } from "../../../types/client";
import { GuildId, UserId, ActionType } from "../../../types/antiraid";
import { Guild, Role, GuildMember, User } from "discord.js";
import { findExecutor, isTrusted, hasDangerousPermissions, getDangerousPermissions, getAddedDangerousPermissions, isSelfAssignment, validateBotPermissions, canPunish } from "./detection";
import { stripDangerousRoles, executePunishment } from "./punishment";
import { neutralizeRole } from "./neutralize";
import { notifyAndLog, notifyPermissionFailure, notifyIgnoredAction } from "./notification";
import { registerStoredButtons } from "./buttons";
import db from "./database";
import logManager from "../logManager";
import NodeCache from "node-cache";
/**
 * APA (Anti-Permission Abuse) Module - Main Orchestrator
 * 
 * ARCHITECTURE:
 * - ROLE_CREATE: Neutralize role + punish untrusted creator
 * - ROLE_UPDATE: Neutralize added perms + punish untrusted editor
 * - ROLE_ASSIGN: ONLY punish untrusted assigner (don't touch the pre-existing role!)
 */

require('dotenv').config();
class AntiPermissionAbuse {
  moduleName: string;
  client: ExtendedClient | null;
  configs: NodeCache;
  punishedUsers: NodeCache;
  metrics: Record<string, number>;
  
  constructor(client: ExtendedClient | null = null) {
    this.moduleName = 'APA';
    this.client = client;
    this.configs = new NodeCache({ stdTTL: 1800, checkperiod: 300 });

    // Duplicate punishment prevention: guildId-userId -> timestamp
    this.punishedUsers = new NodeCache({ stdTTL: 60, checkperiod: 15 });

    // Performance metrics
    this.metrics = {
      eventsProcessed: 0,
      rolesNeutralized: 0,
      punishmentsExecuted: 0,
      duplicatesPrevented: 0,
      permissionFailures: 0
    };

    this.init();
  }
  async init() {
    // Initialize DB connection
    await db.connect();
    // Buttons are now registered in setClient to ensure DB/Client readiness

    // Buttons are now registered in setClient to ensure DB/Client readiness

    console.log(`[${this.moduleName}] Anti-Permission Abuse Protection initialized`);
  }
  setClient(client: ExtendedClient) {
    this.client = client;
    console.log(`[${this.moduleName}] Discord client reference set`);

    // Register stored buttons
    registerStoredButtons(client).catch((err: any) => console.error(`[${this.moduleName}] Failed to register stored buttons:`, err));
  }

  // ==========================================
  // CONFIG MANAGEMENT
  // ==========================================

  async syncConfigs() {
    try {
      const dbConfigs = await db.getAllConfigs();
      for (const dbConfig of dbConfigs) {
        const guildId = dbConfig.guildId;
        const cachedConfig = this.configs.get(guildId) as any;

        // Only update cache if different to avoid unnecessary operations
        if (!cachedConfig || JSON.stringify(cachedConfig) !== JSON.stringify(dbConfig.config)) {
          this.configs.set(guildId, dbConfig.config);
        }
      }
    } catch (error: any) {
      console.error(`[${this.moduleName}] ❌ Config sync loop failed:`, error.message);
    }
  }
  getConfig(guildId: GuildId) {
    let cached = this.configs.get(guildId) as any;
    const defaults = getDefaultConfig();

    if (!cached) {
      cached = defaults;
      this.configs.set(guildId, cached);
      
      if (db.collection) {
        db.collection.findOne({ guildId }).then((doc: any) => {
          if (doc && doc.config) {
             this.configs.set(guildId, { ...defaults, ...doc.config });
          }
        }).catch(() => {});
      }
    }

    return { ...defaults, ...cached };
  }
  async updateConfig(guildId: GuildId, newConfig: any) {
    const success = await db.updateConfig(guildId, newConfig);
    if (success) {
      this.configs.set(guildId, newConfig);
      console.log(`[${this.moduleName}] ✅ Config updated for guild ${guildId}`);
      return true;
    }
    return false;
  }

  // ==========================================
  // EVENT HANDLERS (called from main bot)
  // ==========================================

  async handleRoleCreate(role: Role) {
    await this.processEvent(role.guild, 'ROLE_CREATE', role, null, role);
  }
  async handleRoleUpdate(oldRole: Role, newRole: Role) {
    await this.processEvent(newRole.guild, 'ROLE_UPDATE', newRole, oldRole, newRole);
  }
  async handleMemberRoleAdd(member: GuildMember, role: Role) {
    await this.processEvent(member.guild, 'ROLE_ASSIGN', role, null, {
      member,
      role
    });
  }

  // ==========================================
  // MAIN PROCESSING LOGIC
  // ==========================================

  async processEvent(guild: Guild, actionType: ActionType, role: Role, oldRole: Role | null, eventData: any) {
    const guildId = guild.id;
    const config = this.getConfig(guildId);

    // Check if module is enabled
    if (!config.enabled) {
      return;
    }

    // Check monitoring toggles
    if (actionType === 'ROLE_CREATE' && !config.monitorRoleCreation) return;
    if (actionType === 'ROLE_UPDATE' && !config.monitorRoleUpdates) return;
    if (actionType === 'ROLE_ASSIGN' && !config.monitorRoleAssignments) return;

    // Skip managed roles (Integration roles cannot be modified by bots)
    if (role.managed) {
      if (config.debug) console.log(`[${this.moduleName}] Skipping managed role: ${role.name}`);
      return;
    }
    this.metrics.eventsProcessed++;
    try {
      // =============================================
      // STEP 1: Check if role has dangerous permissions
      let isDangerous = false;
      let dangerousPerms: bigint[] = [];
      if (actionType === 'ROLE_CREATE') {
        isDangerous = hasDangerousPermissions(role);
        if (isDangerous) {
          dangerousPerms = getDangerousPermissions(role);
        }
      } else if (actionType === 'ROLE_UPDATE') {
        // Check if dangerous perms were ADDED
        dangerousPerms = getAddedDangerousPermissions(oldRole, role);
        isDangerous = dangerousPerms.length > 0;
      } else if (actionType === 'ROLE_ASSIGN') {
        // For assignment, check if the assigned role has dangerous perms
        isDangerous = hasDangerousPermissions(role);
        if (isDangerous) {
          dangerousPerms = getDangerousPermissions(role);
        }
      }
      if (!isDangerous) return;

      // =============================================
      // STEP 2: Find executor from audit logs
      // =============================================
      const executor = await findExecutor(guild, actionType, role, eventData, config.auditLogTimeout);
      if (!executor) {
        console.log(`[${this.moduleName}] ⚠️ Could not identify executor from audit logs - skipping`);
        return;
      }
      const targetInfo = actionType === 'ROLE_ASSIGN' ? `-> Assigned to: ${eventData.member.user.username} (${eventData.member.id})` : '';

      // =============================================
      // LOG TO CENTRALIZED LOG CHANNEL
      // =============================================
      const eventTypeMap = {
        'ROLE_CREATE': 'DANGEROUS_ROLE_CREATE',
        'ROLE_UPDATE': 'DANGEROUS_ROLE_UPDATE',
        'ROLE_ASSIGN': 'DANGEROUS_ROLE_UPDATE'
      };
      logManager.log(guild, eventTypeMap[actionType as keyof typeof eventTypeMap] || actionType, {
        target: role,
        executor,
        fields: [{
          name: '🎭 Role',
          value: `${role.name} (${role.id})`,
          inline: true
        }, {
          name: '⚠️ Dangerous Permissions',
          value: dangerousPerms.map((p: any) => getPermissionName(p)).join(', ') || 'N/A',
          inline: false
        }, targetInfo ? {
          name: '🎯 Assigned To',
          value: targetInfo,
          inline: true
        } : null].filter(Boolean)
      });
      console.log(`\n[${this.moduleName}] 🚨 APA EVENT DETECTED: ${actionType}`);
      console.log(`[${this.moduleName}] 👤 Executor: ${executor.username} (${executor.id}) ${executor.bot ? '[BOT]' : '[USER]'}`);
      if (targetInfo) console.log(`[${this.moduleName}] 🎯 Target: ${targetInfo}`);
      console.log(`[${this.moduleName}] 🎭 Role: ${role.name} (${role.id})`);
      console.log(`[${this.moduleName}] ⚡ Dangerous Perms: [${dangerousPerms.map((p: any) => getPermissionName(p)).join(', ')}]`);

      // =============================================
      // STEP 3: Check skip conditions
      // =============================================

      // Skip bot's own actions
      const isSelfBot = executor.id === this.client?.user?.id;
      if (isSelfBot) {
        console.log(`[${this.moduleName}] Skipping self-bot action`);
        return;
      }

      // =============================================
      // STEP 3: Fetch Member Early for Hierarchy Checks
      // =============================================
      const member = await guild.members.fetch(executor.id).catch(() => null);
      if (!member) {
        console.log(`[${this.moduleName}] ⚠️ Executor left server or not found`);
        return;
      }

      // =============================================
      // STEP 4: Check Trust & Hierarchy (Ignore but Notify)
      // =============================================

      // 1. Check if user is trusted/owner/whitelisted
      if (isTrusted(executor, guild, config)) {
        // Special case: If whitelisted, we still notify (as per original logic, but now cleaner)
        if (config.whitelistedUsers?.includes(executor.id)) {
          await notifyIgnoredAction(guild, executor, actionType, role, dangerousPerms, {
            roleNeutralized: false,
            stripResult: {
              success: false,
              count: 0
            },
            punishmentResult: {
              success: false,
              reason: 'User is whitelisted'
            }
          }, config);
        } else {
          // For Owner/Trusted Roles: Just warn nicely
          await notifyIgnoredAction(guild, executor, actionType, role, dangerousPerms, 'User is Owner or Trusted', config);
        }
        console.log(`[${this.moduleName}] Skipping trusted user: ${executor.username}`);
        return;
      }

      // 2. Check Hierarchy (If user > bot, we CANNOT punish/act)
      const punishCheck = canPunish(guild, member);
      if (!punishCheck.success) {
        console.log(`[${this.moduleName}] Skipping due to hierarchy/manageable check: ${punishCheck.reason}`);

        // Notify Owner/Log about this (User request: "warn about it simply in log and dms")
        await notifyIgnoredAction(guild, executor, actionType, role, dangerousPerms, `Hierarchy: ${punishCheck.reason}`, config);
        return;
      }

      // Skip self-assignment (edge case)
      if (actionType === 'ROLE_ASSIGN' && isSelfAssignment(executor, eventData)) {
        console.log(`[${this.moduleName}] Skipping self-assignment`);
        return;
      }

      // =============================================
      // STEP 5: Validate bot permissions
      // =============================================
      const permCheck = validateBotPermissions(guild);
      if (!permCheck.hasEssentialPerms) {
        console.error(`[${this.moduleName}] ❌ CRITICAL: Bot lacks essential permissions!`);
        this.metrics.permissionFailures++;
        if (config.notifyOwner && config.notifyOnPermissionFailure) {
          await notifyPermissionFailure(guild, executor, actionType, role, dangerousPerms, permCheck, config);
        }
        return;
      }

      // =============================================
      // STEP 6: NEUTRALIZATION (ROLE_CREATE/UPDATE only!)
      //For ROLE_ASSIGN: We DON'T touch the pre-existing role!
      // =============================================
      let roleNeutralized = false;
      let neutralizeResult = {
        success: true
      };
      if (actionType === 'ROLE_CREATE' || actionType === 'ROLE_UPDATE') {
        neutralizeResult = await neutralizeRole(role, dangerousPerms);
        roleNeutralized = neutralizeResult.success;
        if (roleNeutralized) {
          this.metrics.rolesNeutralized++;
        } else {
          console.error(`[${this.moduleName}] ❌ FAILED to neutralize role`);
          this.metrics.permissionFailures++;
          if (config.notifyOwner && config.notifyOnPermissionFailure) {
            await notifyPermissionFailure(guild, executor, actionType, role, dangerousPerms, permCheck, config);
          }
          // Continue to punishment even if neutralization failed
        }
      } else if (actionType === 'ROLE_ASSIGN') {
        // For ROLE_ASSIGN: We DON'T neutralize the role!
        // The role is pre-existing and legitimate.
        // We only punish the untrusted user who assigned it.
        console.log(`[${this.moduleName}] ℹ️ ROLE_ASSIGN - Not neutralizing pre-existing role, only punishing assigner`);
      }

      // =============================================
      // STEP 7: Check duplicate punishment
      // =============================================
      const isDuplicate = this.isAlreadyPunished(guildId, executor.id);
      if (isDuplicate) {
        this.metrics.duplicatesPrevented++;
        console.log(`[${this.moduleName}] User ${executor.username} already punished recently, skipping`);
        return;
      }

      // =============================================
      // STEP 8: Fetch member and punish executor
      // =============================================
      // Note: Member was already fetched in Step 3!

      let stripResult: any = {
        success: false,
        count: 0
      };
      let punishmentResult: any = {
        success: false,
        reason: 'Member not found'
      };
      if (member) {
        // Strip dangerous roles from executor
        if (config.stripExecutorRoles) {
          stripResult = await stripDangerousRoles(guild, executor);
          if (stripResult.success && stripResult.count > 0) {
            this.metrics.punishmentsExecuted++;
          }
        }

        // Execute configured punishment (timeout/kick/ban)
        punishmentResult = await executePunishment(member, guild, config);
        if (punishmentResult.success) {
          this.metrics.punishmentsExecuted++;
        }
      }

      // Mark as punished
      this.markAsPunished(guildId, executor.id);

      // =============================================
      // STEP 9: Notify owner and log
      // =============================================
      const results = {
        roleNeutralized,
        stripResult,
        punishmentResult
      };

      // Unified notification + logging (Simultaneous Button Updates)
      await notifyAndLog(guild, executor, actionType, role, dangerousPerms, results, config);
      console.log(`[${this.moduleName}] ✅ Event processed successfully`);
    } catch (error: any) {
      console.error(`[${this.moduleName}] ❌ Error processing ${actionType}:`, error.message);
    }
  }

  // ==========================================
  // DUPLICATE PUNISHMENT PREVENTION
  // ==========================================

  isAlreadyPunished(guildId: any, userId: any) {
    return this.punishedUsers.has(`${guildId}-${userId}`);
  }
  markAsPunished(guildId: any, userId: any) {
    const config = this.getConfig(guildId);
    const cooldownMs = (config.punishmentCooldown || 300);
    this.punishedUsers.set(`${guildId}-${userId}`, Date.now(), cooldownMs);
  }

  // ==========================================
  // STATUS & CLEANUP
  // ==========================================

  getStatus(guildId: any) {
    const config = this.getConfig(guildId);
    const punishedCount = (this.punishedUsers.get(guildId) as any)?.size || 0;
    return {
      moduleName: this.moduleName,
      enabled: config.enabled,
      config,
      stats: {
        currentlyPunishedUsers: punishedCount,
        punishmentCooldownSeconds: config.punishmentCooldown
      },
      metrics: this.metrics,
      dangerousPermissions: DANGEROUS_PERMISSIONS.map((p: any) => getPermissionName(p)),
      isConnectedToMongoDB: db.collection !== null,
      hasDiscordClient: this.client !== null
    };
  }
  async shutdown() {
    console.log(`[${this.moduleName}] 🛑 Shutting down...`);
    this.configs.close();
    this.punishedUsers.close();
    await db.close();
  }
}
export default AntiPermissionAbuse;
