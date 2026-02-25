/**
 * Redis pub/sub listener for the Discord bot.
 *
 * Subscribes to channels published by the Next.js web app:
 * - `discord:user-linked`         — user linked their Discord account → grant roles
 * - `discord:user-unlinked`       — user unlinked → revoke roles
 * - `discord:user-role-changed`    — system role changed → sync Discord roles
 * - `discord:user-deactivated`    — user deactivated → revoke roles
 */
import type { Client } from "discord.js";
import { Redis } from "ioredis";
import { prisma } from "../lib/prisma.js";
import {
  grantRolesToUser,
  revokeAllRoles,
  syncUserRole,
} from "./roles.js";

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

export interface UserRoleChangedEvent {
  userId: string;
  tenantId: string;
  discordUserId: string;
  newRole: string;
}

export interface UserDeactivatedEvent {
  userId: string;
  tenantId: string;
  discordUserId: string;
}

const CHANNELS = [
  "discord:user-linked",
  "discord:user-unlinked",
  "discord:user-role-changed",
  "discord:user-deactivated",
] as const;

export async function startRedisListener(client: Client): Promise<void> {
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

  await subscriber.subscribe(...CHANNELS);
  console.log("[redis-listener] Subscribed to channels:", CHANNELS.join(", "));

  subscriber.on("message", (channel: string, message: string) => {
    try {
      switch (channel) {
        case "discord:user-linked": {
          const event = JSON.parse(message) as UserLinkedEvent;
          handleUserLinked(client, event);
          break;
        }
        case "discord:user-unlinked": {
          const event = JSON.parse(message) as UserUnlinkedEvent;
          handleUserUnlinked(client, event);
          break;
        }
        case "discord:user-role-changed": {
          const event = JSON.parse(message) as UserRoleChangedEvent;
          handleUserRoleChanged(client, event);
          break;
        }
        case "discord:user-deactivated": {
          const event = JSON.parse(message) as UserDeactivatedEvent;
          handleUserDeactivated(client, event);
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

async function handleUserLinked(
  client: Client,
  event: UserLinkedEvent
): Promise<void> {
  console.log(
    `[redis-listener] User linked: userId=${event.userId}, ` +
      `discordUserId=${event.discordUserId}, tenantId=${event.tenantId}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) {
    console.warn(
      `[redis-listener] Tenant ${event.tenantId} has no discordGuildId — skipping role grant`
    );
    return;
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: { userId: event.userId, tenantId: event.tenantId },
    },
    select: { role: true },
  });
  const systemRole = membership?.role ?? "WORKER";

  try {
    await grantRolesToUser(
      client,
      tenant.discordGuildId,
      event.discordUserId,
      systemRole
    );
    console.log(
      `[redis-listener] Granted roles for ${event.discordUserId} in guild ${tenant.discordGuildId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to grant roles:", err);
  }
}

async function handleUserUnlinked(
  client: Client,
  event: UserUnlinkedEvent
): Promise<void> {
  console.log(
    `[redis-listener] User unlinked: userId=${event.userId}, ` +
      `discordUserId=${event.discordUserId}, tenantId=${event.tenantId}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) {
    console.log(
      `[redis-listener] Tenant ${event.tenantId} has no discordGuildId — nothing to revoke`
    );
    return;
  }

  try {
    await revokeAllRoles(client, tenant.discordGuildId, event.discordUserId);
    console.log(
      `[redis-listener] Revoked roles for ${event.discordUserId} in guild ${tenant.discordGuildId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to revoke roles:", err);
  }
}

async function handleUserRoleChanged(
  client: Client,
  event: UserRoleChangedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Role changed: userId=${event.userId}, ` +
      `newRole=${event.newRole}, tenantId=${event.tenantId}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) {
    console.warn(
      `[redis-listener] Tenant ${event.tenantId} has no discordGuildId — skipping role sync`
    );
    return;
  }

  try {
    await syncUserRole(
      client,
      tenant.discordGuildId,
      event.discordUserId,
      event.newRole
    );
    console.log(
      `[redis-listener] Synced role for ${event.discordUserId} in guild ${tenant.discordGuildId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to sync role:", err);
  }
}

async function handleUserDeactivated(
  client: Client,
  event: UserDeactivatedEvent
): Promise<void> {
  console.log(
    `[redis-listener] User deactivated: userId=${event.userId}, ` +
      `discordUserId=${event.discordUserId}, tenantId=${event.tenantId}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) {
    console.log(
      `[redis-listener] Tenant ${event.tenantId} has no discordGuildId — nothing to revoke`
    );
    return;
  }

  try {
    await revokeAllRoles(client, tenant.discordGuildId, event.discordUserId);
    console.log(
      `[redis-listener] Revoked roles for deactivated ${event.discordUserId} in guild ${tenant.discordGuildId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to revoke roles (deactivated):", err);
  }
}
