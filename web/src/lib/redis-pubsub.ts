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
