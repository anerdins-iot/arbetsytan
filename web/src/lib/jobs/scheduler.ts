/**
 * Background job scheduler.
 * Runs automation executor and other periodic jobs.
 * Starts automatically when the Next.js server starts.
 */

import { runAutomationExecutorJob } from "./automation-executor";
import { runDeadlineReminderJob } from "./deadline-reminder";

// Interval in milliseconds
const AUTOMATION_INTERVAL_MS = 60_000; // 1 minute
const DEADLINE_REMINDER_INTERVAL_MS = 60 * 60_000; // 1 hour

let automationIntervalId: ReturnType<typeof setInterval> | null = null;
let deadlineIntervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Start the background job scheduler.
 * Safe to call multiple times - will only start once.
 */
export function startScheduler() {
  if (isRunning) {
    console.info("[scheduler] Already running, skipping start");
    return;
  }

  // Don't run scheduler during build or in edge runtime
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.info("[scheduler] Skipping start during build");
    return;
  }

  isRunning = true;
  console.info("[scheduler] Starting background job scheduler");

  // Run automation executor every minute
  automationIntervalId = setInterval(async () => {
    try {
      const result = await runAutomationExecutorJob();
      if (result.processed > 0) {
        console.info("[scheduler] Automation executor completed", result);
      }
    } catch (err) {
      console.error("[scheduler] Automation executor error:", err);
    }
  }, AUTOMATION_INTERVAL_MS);

  // Run deadline reminder every hour
  deadlineIntervalId = setInterval(async () => {
    try {
      const result = await runDeadlineReminderJob();
      if (result.remindersTriggered > 0) {
        console.info("[scheduler] Deadline reminder completed", result);
      }
    } catch (err) {
      console.error("[scheduler] Deadline reminder error:", err);
    }
  }, DEADLINE_REMINDER_INTERVAL_MS);

  // Run once immediately on startup (after a short delay to let DB connect)
  setTimeout(async () => {
    try {
      const result = await runAutomationExecutorJob();
      console.info("[scheduler] Initial automation check completed", result);
    } catch (err) {
      console.error("[scheduler] Initial automation check error:", err);
    }
  }, 5000);

  console.info("[scheduler] Background jobs scheduled", {
    automationInterval: `${AUTOMATION_INTERVAL_MS / 1000}s`,
    deadlineReminderInterval: `${DEADLINE_REMINDER_INTERVAL_MS / 60000}min`,
  });
}

/**
 * Stop the background job scheduler.
 */
export function stopScheduler() {
  if (!isRunning) return;

  console.info("[scheduler] Stopping background job scheduler");

  if (automationIntervalId) {
    clearInterval(automationIntervalId);
    automationIntervalId = null;
  }

  if (deadlineIntervalId) {
    clearInterval(deadlineIntervalId);
    deadlineIntervalId = null;
  }

  isRunning = false;
}

/**
 * Check if the scheduler is running.
 */
export function isSchedulerRunning() {
  return isRunning;
}
