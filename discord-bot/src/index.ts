import { startBot } from "./client.js";

async function main() {
  console.log("Starting Discord bot...");
  await startBot();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
