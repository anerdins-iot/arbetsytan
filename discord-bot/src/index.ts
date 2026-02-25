import { startBot } from "./client.js";
import { startRedisListener } from "./services/redis-listener.js";

async function main() {
  console.log("Starting Discord bot...");

  // Start Redis listener for web app events (OAuth2 linking, etc.)
  await startRedisListener();

  // Start the Discord bot client
  await startBot();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
