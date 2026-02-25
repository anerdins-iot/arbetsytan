import { startBot } from "./client.js";
import { startRedisListener, getRedisSubscriber } from "./services/redis-listener.js";
import { prisma } from "./lib/prisma.js";
import { startRateLimiterCleanup } from "./utils/rate-limiter.js";

let isShuttingDown = false;

async function main() {
  console.log("Starting Discord bot...");

  // Start the Discord bot client first so we have a client for role sync
  const client = await startBot();

  // Start Redis listener for web app events (OAuth2 linking, role changes, etc.)
  await startRedisListener(client);

  // Start rate limiter cleanup interval
  const cleanupInterval = startRateLimiterCleanup();

  // Graceful shutdown handler
  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

    // Clear the cleanup interval
    clearInterval(cleanupInterval);

    // Destroy the Discord client
    try {
      console.log("[shutdown] Disconnecting Discord client...");
      client.destroy();
      console.log("[shutdown] Discord client disconnected.");
    } catch (err) {
      console.error("[shutdown] Error disconnecting Discord client:", err);
    }

    // Close Redis connection
    const redis = getRedisSubscriber();
    if (redis) {
      try {
        console.log("[shutdown] Closing Redis connection...");
        await redis.quit();
        console.log("[shutdown] Redis connection closed.");
      } catch (err) {
        console.error("[shutdown] Error closing Redis:", err);
      }
    }

    // Close Prisma connection
    try {
      console.log("[shutdown] Closing database connection...");
      await prisma.$disconnect();
      console.log("[shutdown] Database connection closed.");
    } catch (err) {
      console.error("[shutdown] Error closing database:", err);
    }

    console.log("[shutdown] Graceful shutdown complete.");
    process.exit(0);
  }

  // Listen for shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Catch unhandled errors to prevent crashes
  process.on("unhandledRejection", (error) => {
    console.error("[process] Unhandled rejection:", error);
  });

  process.on("uncaughtException", (error) => {
    console.error("[process] Uncaught exception:", error);
    // For uncaught exceptions, it's safer to exit
    shutdown("uncaughtException");
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
