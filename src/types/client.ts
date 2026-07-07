import { Client, Collection } from "discord.js";

export interface ExtendedClient extends Client {
    slashCommands: Collection<string, any>;
    prefixCommands: Collection<string, any>;
    afkCache: Collection<string, any>;
    prefixCache: Map<string, string>;
}
