import { Client, Events } from "discord.js";

export function registerReady(client: Client): void {
  client.once(Events.ClientReady, (c) => {
    console.log(`Bot online as ${c.user.tag}`);
    const guildCount = c.guilds.cache.size;
    console.log(`Serving ${guildCount} guild(s)`);
  });
}
