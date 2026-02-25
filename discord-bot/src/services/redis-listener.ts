/**
 * Redis pub/sub listener for the Discord bot.
 *
 * Subscribes to channels published by the Next.js web app:
 * - `discord:user-linked`   — user linked their Discord account
 * - `discord:user-unlinked` — user unlinked their Discord account
 *
 * Placeholder handlers log the events; actual role assignment
 * will be implemented in Fas 5 (Rollsynkronisering).
 */
import { Redis } from "ioredis";

export interface UserLinkedEvent {
  userId: string;
  tenantId: string;
  discordUserId: string;
  discordUsername: string;
}

export interface UserUnlinkedEvent {
  userId: string;
  tenantId: string;
  discordUserId: string;
}

const CHANNELS = ["discord:user-linked", "discord:user-unlinked"] as const;

export async function startRedisListener(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[redis-listener] No REDIS_URL — skipping Redis subscriber");
    return;
  }

  const subscriber = new Redis(redisUrl);

  subscriber.on("error", (err: Error) => {
    console.error("[redis-listener] Redis error:", err.message);
  });

  subscriber.on("connect", () => {
    console.log("[redis-listener] Connected to Redis");
  });

  // Subscribe to all Discord-related channels
  await subscriber.subscribe(...CHANNELS);
  console.log("[redis-listener] Subscribed to channels:", CHANNELS.join(", "));

  subscriber.on("message", (channel: string, message: string) => {
    try {
      switch (channel) {
        case "discord:user-linked": {
          const event = JSON.parse(message) as UserLinkedEvent;
          handleUserLinked(event);
          break;
        }
        case "discord:user-unlinked": {
          const event = JSON.parse(message) as UserUnlinkedEvent;
          handleUserUnlinked(event);
          break;
        }
        default:
          console.log("[redis-listener] Unknown channel:", channel);
      }
    } catch (err) {
      console.error("[redis-listener] Failed to process message:", err);
    }
  });
}

function handleUserLinked(event: UserLinkedEvent): void {
  console.log(
    `[redis-listener] User linked: userId=${event.userId}, ` +
      `discordUserId=${event.discordUserId}, ` +
      `username=${event.discordUsername}, ` +
      `tenantId=${event.tenantId}`
  );
  // TODO (Fas 5): Give Discord roles and channel access
  // - Fetch tenant's Discord guild
  // - Give @Medlem base role
  // - Give system role (Admin, Projektledare, Montör, etc.)
  // - Grant project channel access based on project memberships
}

function handleUserUnlinked(event: UserUnlinkedEvent): void {
  console.log(
    `[redis-listener] User unlinked: userId=${event.userId}, ` +
      `discordUserId=${event.discordUserId}, ` +
      `tenantId=${event.tenantId}`
  );
  // TODO (Fas 5): Revoke Discord roles
  // - Remove all managed roles from the Discord member
}
