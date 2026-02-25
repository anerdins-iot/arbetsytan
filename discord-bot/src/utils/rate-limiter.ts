/**
 * Simple in-memory rate limiter per user.
 * Limits AI requests to a configurable number per minute per user.
 * Uses a sliding window approach with timestamp arrays.
 */

const MAX_REQUESTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60_000; // Clean up stale entries every 5 minutes

/** Map of userId -> array of request timestamps. */
const userRequests = new Map<string, number[]>();

/**
 * Check if a user is rate limited.
 * Returns { allowed: true } if the request is allowed,
 * or { allowed: false, retryAfterSeconds } if rate limited.
 */
export function checkRateLimit(userId: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let timestamps = userRequests.get(userId);

  if (!timestamps) {
    timestamps = [];
    userRequests.set(userId, timestamps);
  }

  // Remove timestamps outside the current window
  const filtered = timestamps.filter((t) => t > windowStart);
  userRequests.set(userId, filtered);

  if (filtered.length >= MAX_REQUESTS_PER_MINUTE) {
    // Calculate when the oldest request in the window expires
    const oldestInWindow = filtered[0];
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return { allowed: false, retryAfterSeconds };
  }

  // Record this request
  filtered.push(now);

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Periodically clean up stale entries from the rate limiter map.
 * Call this once at startup.
 */
export function startRateLimiterCleanup(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    for (const [userId, timestamps] of userRequests) {
      const filtered = timestamps.filter((t) => t > windowStart);
      if (filtered.length === 0) {
        userRequests.delete(userId);
      } else {
        userRequests.set(userId, filtered);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}
