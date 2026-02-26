/**
 * Slash command registry.
 * Exports all commands and handles registration with Discord API.
 */
import type { ChatInputCommandInteraction } from "discord.js";
import { REST, Routes } from "discord.js";
import { env } from "../lib/env.js";
import * as setup from "./setup.js";

/** All registered slash commands */
const commands = [setup] as const;

/** Map of command name → execute function for fast lookup */
const commandMap = new Map<
  string,
  (interaction: ChatInputCommandInteraction) => Promise<void>
>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd.execute);
}

/**
 * Handle a slash command interaction by routing to the correct handler.
 */
export async function handleCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const handler = commandMap.get(interaction.commandName);
  if (!handler) {
    console.warn(
      `[commands] Unknown command: ${interaction.commandName}`
    );
    return;
  }
  await handler(interaction);
}

/**
 * Register all slash commands with Discord API (global commands).
 * Called once on bot startup.
 */
export async function registerSlashCommands(): Promise<void> {
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  const commandData = commands.map((cmd) => cmd.data.toJSON());

  try {
    console.log(
      `[commands] Registering ${commandData.length} slash command(s)...`
    );
    await rest.put(
      Routes.applicationCommands(env.DISCORD_CLIENT_ID),
      { body: commandData }
    );
    console.log("[commands] Slash commands registered successfully.");
  } catch (error) {
    console.error("[commands] Failed to register slash commands:", error);
  }
}
