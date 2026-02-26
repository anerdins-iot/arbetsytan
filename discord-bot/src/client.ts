import {
  Client,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { env } from "./lib/env.js";
import { registerReady } from "./events/ready.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";
import { registerMessageReactionAdd } from "./events/messageReactionAdd.js";
import { registerSlashCommands } from "./commands/index.js";

export async function startBot(): Promise<Client> {
  const token = env.DISCORD_TOKEN;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  });

  // Register event handlers
  registerReady(client);
  registerMessageCreate(client);
  registerInteractionCreate(client);
  registerMessageReactionAdd(client);

  // Reconnection and error event listeners
  client.on("warn", (info) => {
    console.warn("[discord] Warning:", info);
  });

  client.on("error", (error) => {
    console.error("[discord] Client error:", error.message);
  });

  // Use debug listener to track reconnection events
  client.on("debug", (info) => {
    if (
      info.includes("reconnect") ||
      info.includes("resume") ||
      info.includes("disconnect")
    ) {
      console.log("[discord] Gateway:", info);
    }
  });

  // Shard events (discord.js v14 uses sharding internally even for single shard)
  client.on("shardDisconnect", (event, shardId) => {
    console.warn(`[discord] Shard ${shardId} disconnected (code: ${event.code})`);
  });

  client.on("shardReconnecting", (shardId) => {
    console.log(`[discord] Shard ${shardId} reconnecting...`);
  });

  client.on("shardResume", (shardId, replayedEvents) => {
    console.log(`[discord] Shard ${shardId} resumed (replayed ${replayedEvents} events)`);
  });

  client.on("shardError", (error, shardId) => {
    console.error(`[discord] Shard ${shardId} error:`, error.message);
  });

  client.on("shardReady", (shardId) => {
    console.log(`[discord] Shard ${shardId} ready`);
  });

  await client.login(token);

  // Register slash commands with Discord API after login
  await registerSlashCommands();

  return client;
}
