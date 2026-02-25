import {
  Client,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { registerReady } from "./events/ready.js";
import { registerMessageCreate } from "./events/messageCreate.js";

export async function startBot(): Promise<Client> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN is required");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  registerReady(client);
  registerMessageCreate(client);

  await client.login(token);
  return client;
}
