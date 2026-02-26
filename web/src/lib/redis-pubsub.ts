import { createClient, type RedisClientType } from "redis";

/**
 * Redis pub/sub channel used to bridge server actions → Socket.IO process.
 * Server actions publish events here when getIO() returns null (different process).
 * The Socket.IO server subscribes and emits to the correct rooms.
 */
const CHANNEL = "socket:emit";

export type SocketEmitMessage = {
  room: string;
  eventName: string;
  payload: Record<string, unknown>;
};

// ─── Publisher (used by server actions / API routes) ────────────────────────

let pubClient: RedisClientType | null = null;
let pubConnecting: Promise<void> | null = null;

async function getPublisher(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (pubClient?.isReady) return pubClient;

  // Avoid multiple concurrent connection attempts
  if (pubConnecting) {
    await pubConnecting;
    return pubClient;
  }

  pubConnecting = (async () => {
    try {
      pubClient = createClient({ url: redisUrl }) as RedisClientType;
      pubClient.on("error", (err) => {
        console.warn("[redis-pubsub] Publisher error:", err.message);
      });
      await pubClient.connect();
    } catch (err) {
      console.warn("[redis-pubsub] Failed to connect publisher:", err);
      pubClient = null;
    }
  })();

  await pubConnecting;
  pubConnecting = null;
  return pubClient;
}

/**
 * Publish a socket event via Redis.
 * Called from db-emit-extension when getIO() is null.
 * Fire-and-forget — never throws.
 */
export async function publishSocketEvent(msg: SocketEmitMessage): Promise<void> {
  try {
    const client = await getPublisher();
    if (!client) {
      console.log("[redis-pubsub] No Redis client available, skipping publish for:", msg.eventName);
      return;
    }
    console.log("[redis-pubsub] Publishing event:", msg.eventName, "to room:", msg.room);
    await client.publish(CHANNEL, JSON.stringify(msg));
  } catch (err) {
    console.warn("[redis-pubsub] Failed to publish:", err);
  }
}

// ─── Discord event publisher ────────────────────────────────────────────────

/**
 * Publish an event on a dedicated Redis channel for the Discord bot.
 * Channel name is used directly (e.g. "discord:user-linked").
 * Fire-and-forget — never throws.
 */
export async function publishDiscordEvent(
  channel: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const client = await getPublisher();
    if (!client) {
      console.log("[redis-pubsub] No Redis client available, skipping discord publish for:", channel);
      return;
    }
    console.log("[redis-pubsub] Publishing discord event:", channel);
    await client.publish(channel, JSON.stringify(payload));
  } catch (err) {
    console.warn("[redis-pubsub] Failed to publish discord event:", err);
  }
}

// ─── Discord guild verification (request/response) ──────────────────────────

const VERIFY_REQUEST_CHANNEL = "discord:verify-guild";
const VERIFY_RESPONSE_CHANNEL = "discord:verify-response";

export type VerifyGuildResult = "guild-verified" | "guild-not-found" | "timeout";

/**
 * Ask the Discord bot to verify that it is a member of the given guild.
 * Publishes "discord:verify-guild" and waits for "discord:verify-response" with matching requestId.
 * Resolves with "timeout" if the bot does not respond within timeoutMs (default 5000).
 */
export async function verifyDiscordGuildWithBot(
  guildId: string,
  timeoutMs: number = 5000
): Promise<VerifyGuildResult> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[redis-pubsub] No REDIS_URL — cannot verify guild");
    return "timeout";
  }

  const requestId = crypto.randomUUID();
  const payload = { requestId, guildId };

  return new Promise<VerifyGuildResult>((resolve) => {
    const timeoutId = setTimeout(() => {
      subClient?.unsubscribe(VERIFY_RESPONSE_CHANNEL).catch(() => {});
      subClient?.quit().catch(() => {});
      resolve("timeout");
    }, timeoutMs);

    let subClient: RedisClientType | null = null;

    const handleMessage = (message: string) => {
      try {
        const data = JSON.parse(message) as { requestId: string; status: string };
        if (data.requestId !== requestId) return;
        clearTimeout(timeoutId);
        subClient?.unsubscribe(VERIFY_RESPONSE_CHANNEL).catch(() => {});
        subClient?.quit().catch(() => {});
        if (data.status === "guild-verified") {
          resolve("guild-verified");
        } else {
          resolve("guild-not-found");
        }
      } catch {
        // ignore parse errors for other requests
      }
    };

    (async () => {
      try {
        subClient = createClient({ url: redisUrl }) as RedisClientType;
        subClient.on("error", (err) => {
          console.warn("[redis-pubsub] Verify subscriber error:", err.message);
        });
        await subClient.connect();
        await subClient.subscribe(VERIFY_RESPONSE_CHANNEL, (message) => {
          handleMessage(message);
        });

        const pub = await getPublisher();
        if (!pub) {
          clearTimeout(timeoutId);
          await subClient.quit();
          resolve("timeout");
          return;
        }
        await pub.publish(VERIFY_REQUEST_CHANNEL, JSON.stringify(payload));
      } catch (err) {
        console.warn("[redis-pubsub] Verify guild failed:", err);
        clearTimeout(timeoutId);
        if (subClient) {
          subClient.quit().catch(() => {});
        }
        resolve("timeout");
      }
    })();
  });
}

// ─── Subscriber (used by Socket.IO server process) ─────────────────────────

/**
 * Subscribe to the Redis channel and forward events to Socket.IO.
 * Called once during Socket.IO server initialization.
 *
 * @param emitFn - Function that emits to a Socket.IO room.
 *                 Signature: (room, eventName, payload) => void
 */
export async function subscribeSocketEvents(
  emitFn: (room: string, eventName: string, payload: Record<string, unknown>) => void
): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[redis-pubsub] No REDIS_URL — skipping subscriber");
    return;
  }

  try {
    const subClient = createClient({ url: redisUrl }) as RedisClientType;
    subClient.on("error", (err) => {
      console.warn("[redis-pubsub] Subscriber error:", err.message);
    });
    await subClient.connect();

    await subClient.subscribe(CHANNEL, (message) => {
      try {
        const msg = JSON.parse(message) as SocketEmitMessage;
        emitFn(msg.room, msg.eventName, msg.payload);
      } catch (err) {
        console.warn("[redis-pubsub] Failed to parse message:", err);
      }
    });

    console.log("[redis-pubsub] Subscribed to channel:", CHANNEL);
  } catch (err) {
    console.error("[redis-pubsub] Failed to start subscriber:", err);
  }
}
