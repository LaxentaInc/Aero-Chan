import { Client, Guild, GuildMember } from 'discord.js';
import { ExtendedClient } from './client';

export type GuildId = string;
export type UserId = string;

export interface AntiRaidModuleInterface {
    getStatus?: (guildId: GuildId) => unknown;
    getConfig?: (guildId: GuildId) => { enabled: boolean; [key: string]: unknown };
    toggleModule?: (guildId: GuildId, enabled: boolean) => Promise<boolean> | Promise<void> | void;
    disable?: (guildId: GuildId) => Promise<void> | void;
    shutdown?: () => Promise<void> | void;
    handleBotJoin?: (member: GuildMember, inviter?: import('discord.js').User | null) => void;
    handleMemberJoin?: (member: GuildMember) => void;
    setClient?: (client: ExtendedClient) => void;
}

export type ActionType = 'CHANNEL_DELETE' | 'CHANNEL_CREATE' | 'ROLE_DELETE' | 'EMOJI_DELETE' | 'WEBHOOK_CREATE' | 'WEBHOOK_UPDATE' | 'ROLE_CREATE' | 'ROLE_UPDATE' | 'ROLE_ASSIGN' | 'MESSAGE_SPAM' | 'LINK_SPAM' | 'IMAGE_SPAM' | string;

export type PunishmentAction = 'timeout' | 'kick' | 'ban' | 'strip' | 'none';

export interface BaseGuildConfig {
    enabled: boolean;
    whitelistedUsers?: UserId[];
    whitelistedBots?: UserId[];
    whitelistedRoles?: string[];
}
