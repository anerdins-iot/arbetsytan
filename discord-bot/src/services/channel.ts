/**
 * Discord channel management for project channels and categories.
 * Used by the Redis listener when the web app emits project/category events.
 */
import type { Client, TextChannel, CategoryChannel } from "discord.js";
import {
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
} from "discord.js";
import { prisma } from "../lib/prisma.js";

const ARCHIVE_CATEGORY_NAME = "Arkiv";

/**
 * Convert project name to a Discord-valid channel name (lowercase, hyphens, max 100 chars).
 */
export function toChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "projekt";
}

/**
 * Get or create a Discord channel category by name (e.g. "Projekt", "Arkiv").
 * Does not touch the database; only Discord API.
 */
export async function getOrCreateCategory(
  client: Client,
  guildId: string,
  categoryName: string,
  _categoryType?: string
): Promise<string | null> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory && c.name === categoryName
  );
  if (existing) return existing.id;

  const category = await guild.channels
    .create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      reason: "Discord integration category",
    })
    .catch((err) => {
      console.error("[channel] Failed to create category:", err);
      return null;
    });

  return category?.id ?? null;
}

/**
 * Create a project channel under the given category. Sets @everyone ViewChannel=false,
 * so only members with explicit overwrites can see it. Returns the new channel ID or null.
 */
export async function createProjectChannel(
  client: Client,
  guildId: string,
  categoryId: string | null,
  projectName: string,
  projectId: string
): Promise<string | null> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const name = toChannelName(projectName);
  const permissionOverwrites = [
    {
      id: guild.id,
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel,
    },
  ];

  const channel = await guild.channels
    .create({
      name,
      type: ChannelType.GuildText,
      parent: categoryId ?? undefined,
      permissionOverwrites,
      reason: `Project channel for ${projectId}`,
    })
    .catch((err) => {
      console.error("[channel] Failed to create project channel:", err);
      return null;
    });

  if (!channel) return null;

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { discordChannelId: channel.id },
    });
  } catch (err) {
    console.error("[channel] Failed to update Project.discordChannelId:", err);
    // Channel exists on Discord; web can retry or fix manually
  }

  return channel.id;
}

/**
 * Archive a project channel: move to "Arkiv" category and set read-only (SendMessages denied).
 */
export async function archiveProjectChannel(
  client: Client,
  guildId: string,
  channelId: string
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || channel.isThread()) return;

  const textChannel = channel as TextChannel;
  const archiveCategoryId = await getOrCreateCategory(
    client,
    guildId,
    ARCHIVE_CATEGORY_NAME,
    "ARCHIVE"
  );
  if (archiveCategoryId) {
    await textChannel
      .setParent(archiveCategoryId, {
        lockPermissions: false,
        reason: "Project archived",
      })
      .catch((err: unknown) =>
        console.error("[channel] Failed to move channel to archive:", err)
      );
  }

  // Set read-only for members who have access: keep ViewChannel etc but deny SendMessages
  const readOnlyAllow = {
    ViewChannel: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    SendMessages: false,
  };
  for (const [id, overwrite] of textChannel.permissionOverwrites.cache) {
    if (id === guild.id) continue; // @everyone already denied ViewChannel
    if (overwrite.type !== OverwriteType.Member) continue;
    await textChannel.permissionOverwrites
      .edit(id, readOnlyAllow, { reason: "Archived — read-only" })
      .catch((err: unknown) =>
        console.error("[channel] Failed to set member read-only:", id, err)
      );
  }
}

/**
 * Grant or revoke a member's access to a project channel.
 * grant: ViewChannel, SendMessages, ReadMessageHistory, AttachFiles
 * revoke: remove member overwrite so they lose access
 */
export async function updateChannelPermissions(
  client: Client,
  channelId: string,
  memberDiscordId: string,
  action: "grant" | "revoke"
): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || channel.isThread()) return;

  const guildChannel = channel as TextChannel;
  if (action === "grant") {
    await guildChannel.permissionOverwrites
      .edit(memberDiscordId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      }, { reason: "Project member added" })
      .catch((err: unknown) =>
        console.error("[channel] Failed to grant permissions:", err)
      );
  } else {
    await guildChannel.permissionOverwrites
      .delete(memberDiscordId, "Project member removed")
      .catch((err: unknown) => {
        if ((err as { code?: number })?.code !== 10013) {
          console.error("[channel] Failed to revoke permissions:", err);
        }
      });
  }
}

export interface CategorySyncItem {
  id: string;
  name: string;
  type: string;
  discordCategoryId?: string | null;
}

/**
 * Sync Discord channel categories from the admin panel.
 * Creates missing categories on Discord, updates names, and stores discordCategoryId.
 * Does not delete Discord categories (only create/update).
 */
export async function syncCategoryStructure(
  client: Client,
  guildId: string,
  tenantId: string,
  categories: CategorySyncItem[]
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  for (const cat of categories) {
    if (cat.discordCategoryId) {
      const discordCat = await guild.channels
        .fetch(cat.discordCategoryId)
        .catch(() => null);
      if (discordCat && discordCat.type === ChannelType.GuildCategory) {
        if ((discordCat as CategoryChannel).name !== cat.name) {
          await (discordCat as CategoryChannel)
            .setName(cat.name, "Sync from admin panel")
            .catch((err) =>
              console.error(
                "[channel] Failed to rename category:",
                cat.id,
                err
              )
            );
        }
      }
      continue;
    }

    const created = await guild.channels
      .create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        reason: "Sync from admin panel",
      })
      .catch((err) => {
        console.error("[channel] Failed to create category:", cat.name, err);
        return null;
      });

    if (created) {
      try {
        await prisma.discordCategory.update({
          where: { id: cat.id },
          data: { discordCategoryId: created.id },
        });
      } catch (err) {
        console.error(
          "[channel] Failed to update DiscordCategory.discordCategoryId:",
          cat.id,
          err
        );
      }
    }
  }
}
