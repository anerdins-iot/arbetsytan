/**
 * Redis pub/sub listener for the Discord bot.
 *
 * Subscribes to channels published by the Next.js web app:
 * - `discord:user-linked`         — user linked their Discord account → grant roles
 * - `discord:user-unlinked`       — user unlinked → revoke roles
 * - `discord:user-role-changed`   — system role changed → sync Discord roles
 * - `discord:user-deactivated`    — user deactivated → revoke roles
 * - `discord:project-created`    — create Discord channel for project
 * - `discord:project-archived`   — archive Discord channel
 * - `discord:project-member-added`   — grant member access to project channel
 * - `discord:project-member-removed` — revoke member access
 * - `discord:category-created`    — create Discord category
 * - `discord:category-deleted`   — delete Discord category
 * - `discord:category-sync`      — sync category structure from admin panel
 */
import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import { Redis } from "ioredis";
import { prisma } from "../lib/prisma.js";
import {
  grantRolesToUser,
  revokeAllRoles,
  syncUserRole,
} from "./roles.js";
import {
  createProjectChannel,
  archiveProjectChannel,
  updateChannelPermissions,
  syncCategoryStructure,
  type CategorySyncItem,
} from "./channel.js";

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

export interface ProjectCreatedEvent {
  projectId: string;
  tenantId: string;
  name: string;
}

export interface ProjectArchivedEvent {
  projectId: string;
  tenantId: string;
  channelId: string | null;
}

export interface ProjectMemberAddedEvent {
  projectId: string;
  userId: string;
  discordUserId: string;
  tenantId: string;
}

export interface ProjectMemberRemovedEvent {
  projectId: string;
  userId: string;
  discordUserId: string;
  tenantId: string;
}

export interface CategoryCreatedEvent {
  tenantId: string;
  categoryId: string;
  name: string;
  type: string;
}

export interface CategoryDeletedEvent {
  tenantId: string;
  categoryId: string;
  discordCategoryId: string | null;
}

export interface CategorySyncEvent {
  tenantId: string;
  guildId: string;
  categories: CategorySyncItem[];
}

const CHANNELS = [
  "discord:user-linked",
  "discord:user-unlinked",
  "discord:user-role-changed",
  "discord:user-deactivated",
  "discord:project-created",
  "discord:project-archived",
  "discord:project-member-added",
  "discord:project-member-removed",
  "discord:category-created",
  "discord:category-deleted",
  "discord:category-sync",
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
        case "discord:project-created": {
          const event = JSON.parse(message) as ProjectCreatedEvent;
          handleProjectCreated(client, event);
          break;
        }
        case "discord:project-archived": {
          const event = JSON.parse(message) as ProjectArchivedEvent;
          handleProjectArchived(client, event);
          break;
        }
        case "discord:project-member-added": {
          const event = JSON.parse(message) as ProjectMemberAddedEvent;
          handleProjectMemberAdded(client, event);
          break;
        }
        case "discord:project-member-removed": {
          const event = JSON.parse(message) as ProjectMemberRemovedEvent;
          handleProjectMemberRemoved(client, event);
          break;
        }
        case "discord:category-created": {
          const event = JSON.parse(message) as CategoryCreatedEvent;
          handleCategoryCreated(client, event);
          break;
        }
        case "discord:category-deleted": {
          const event = JSON.parse(message) as CategoryDeletedEvent;
          handleCategoryDeleted(client, event);
          break;
        }
        case "discord:category-sync": {
          const event = JSON.parse(message) as CategorySyncEvent;
          handleCategorySync(client, event);
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

async function handleProjectCreated(
  client: Client,
  event: ProjectCreatedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Project created: projectId=${event.projectId}, tenantId=${event.tenantId}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) {
    console.log(
      `[redis-listener] Tenant ${event.tenantId} has no discordGuildId — skipping channel create`
    );
    return;
  }

  let categoryId: string | null = null;
  const category = await prisma.discordCategory.findFirst({
    where: { tenantId: event.tenantId, type: "PROJECTS" },
    select: { discordCategoryId: true },
  });
  if (category?.discordCategoryId) categoryId = category.discordCategoryId;

  try {
    const channelId = await createProjectChannel(
      client,
      tenant.discordGuildId,
      categoryId,
      event.name,
      event.projectId
    );
    if (channelId) {
      console.log(
        `[redis-listener] Created project channel ${channelId} for ${event.projectId}`
      );
    }
  } catch (err) {
    console.error("[redis-listener] Failed to create project channel:", err);
  }
}

async function handleProjectArchived(
  client: Client,
  event: ProjectArchivedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Project archived: projectId=${event.projectId}, channelId=${event.channelId}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) return;
  const channelId = event.channelId ?? undefined;
  const project = event.channelId
    ? null
    : await prisma.project.findUnique({
        where: { id: event.projectId },
        select: { discordChannelId: true },
      });
  const toArchive = channelId ?? project?.discordChannelId;
  if (!toArchive) {
    console.log(
      `[redis-listener] No Discord channel for project ${event.projectId} — skipping archive`
    );
    return;
  }

  try {
    await archiveProjectChannel(client, tenant.discordGuildId, toArchive);
    console.log(
      `[redis-listener] Archived channel ${toArchive} for project ${event.projectId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to archive project channel:", err);
  }
}

async function handleProjectMemberAdded(
  client: Client,
  event: ProjectMemberAddedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Project member added: projectId=${event.projectId}, discordUserId=${event.discordUserId}`
  );

  const project = await prisma.project.findUnique({
    where: { id: event.projectId },
    select: { discordChannelId: true },
  });
  if (!project?.discordChannelId) return;

  try {
    await updateChannelPermissions(
      client,
      project.discordChannelId,
      event.discordUserId,
      "grant"
    );
    console.log(
      `[redis-listener] Granted channel access for ${event.discordUserId} to ${project.discordChannelId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to grant channel access:", err);
  }
}

async function handleProjectMemberRemoved(
  client: Client,
  event: ProjectMemberRemovedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Project member removed: projectId=${event.projectId}, discordUserId=${event.discordUserId}`
  );

  const project = await prisma.project.findUnique({
    where: { id: event.projectId },
    select: { discordChannelId: true },
  });
  if (!project?.discordChannelId) return;

  try {
    await updateChannelPermissions(
      client,
      project.discordChannelId,
      event.discordUserId,
      "revoke"
    );
    console.log(
      `[redis-listener] Revoked channel access for ${event.discordUserId} from ${project.discordChannelId}`
    );
  } catch (err) {
    console.error("[redis-listener] Failed to revoke channel access:", err);
  }
}

async function handleCategoryCreated(
  client: Client,
  event: CategoryCreatedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Category created: categoryId=${event.categoryId}, name=${event.name}`
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });
  if (!tenant?.discordGuildId) return;

  try {
    await syncCategoryStructure(client, tenant.discordGuildId, event.tenantId, [
      { id: event.categoryId, name: event.name, type: event.type },
    ]);
  } catch (err) {
    console.error("[redis-listener] Failed to create Discord category:", err);
  }
}

async function handleCategoryDeleted(
  client: Client,
  event: CategoryDeletedEvent
): Promise<void> {
  console.log(
    `[redis-listener] Category deleted: categoryId=${event.categoryId}, discordCategoryId=${event.discordCategoryId}`
  );

  if (!event.discordCategoryId) return;

  try {
    const channel = await client.channels.fetch(event.discordCategoryId);
    if (channel && channel.type === ChannelType.GuildCategory) {
      await channel.delete("Category removed in admin panel");
      console.log(
        `[redis-listener] Deleted Discord category ${event.discordCategoryId}`
      );
    }
  } catch (err) {
    console.error("[redis-listener] Failed to delete Discord category:", err);
  }
}

async function handleCategorySync(
  client: Client,
  event: CategorySyncEvent
): Promise<void> {
  console.log(
    `[redis-listener] Category sync: tenantId=${event.tenantId}, count=${event.categories.length}`
  );

  try {
    await syncCategoryStructure(
      client,
      event.guildId,
      event.tenantId,
      event.categories
    );
  } catch (err) {
    console.error("[redis-listener] Failed to sync categories:", err);
  }
}
