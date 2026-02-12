/**
 * Next.js Instrumentation
 * This file runs once when the server starts.
 * Used to initialize background jobs and other server-side setup.
 */

export async function register() {
  // Only run on server (not edge runtime, not build time)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/jobs/scheduler");
    startScheduler();
  }
}
