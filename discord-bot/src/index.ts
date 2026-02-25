import { startBot } from "./client.js";
import { startRedisListener } from "./services/redis-listener.js";

async function main() {
  console.log("Starting Discord bot...");

  // Start the Discord bot client first so we have a client for role sync
  const client = await startBot();

  // Start Redis listener for web app events (OAuth2 linking, role changes, etc.)
  await startRedisListener(client);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
