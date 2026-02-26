/**
 * Discord channel sync service.
 * Creates category + sub-channels (general, tasks, files, activity) for projects.
 * Triggered via Redis event from the web AI tool `syncDiscordChannels`.
 */
import type { Client, Guild } from "discord.js";
import { ChannelType } from "discord.js";
import { prisma } from "../lib/prisma.js";
import { toChannelName } from "./channel.js";

/** Channel types we create per project */
const PROJECT_CHANNEL_TYPES = ["general", "tasks", "files", "activity"] as const;
type ProjectChannelType = (typeof PROJECT_CHANNEL_TYPES)[number];

const CHANNEL_CONFIG: Record<ProjectChannelType, { suffix: string; topic: string }> = {
  general: { suffix: "", topic: "AI-bot svarar här — kopplad till projektet" },
  tasks: { suffix: "-uppgifter", topic: "Uppgifter — skapa trådar för varje uppgift" },
  files: { suffix: "-filer", topic: "Uppladdade filer postas här" },
  activity: { suffix: "-aktivitet", topic: "Anteckningar, statusändringar och aktivitet" },
};

export interface SyncProjectsEvent {
  tenantId: string;
  projectIds: string[];
  requestedBy?: string;
}

export interface SyncResult {
  projectId: string;
  projectName: string;
  categoryId: string | null;
  channels: { type: string; channelId: string }[];
  error?: string;
}

/**
 * Sync one or more projects to Discord channels.
 * Creates a category per project with sub-channels.
 */
export async function syncProjectsToDiscord(
  client: Client,
  event: SyncProjectsEvent
): Promise<SyncResult[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { discordGuildId: true },
  });

  if (!tenant?.discordGuildId) {
    console.warn("[channel-sync] Tenant has no discordGuildId:", event.tenantId);
    return [];
  }

  const guild = await client.guilds.fetch(tenant.discordGuildId).catch(() => null);
  if (!guild) {
    console.warn("[channel-sync] Could not fetch guild:", tenant.discordGuildId);
    return [];
  }

  // Get projects to sync
  const whereClause = event.projectIds.length > 0
    ? { id: { in: event.projectIds }, tenantId: event.tenantId }
    : { tenantId: event.tenantId, status: "ACTIVE" };

  const projects = await prisma.project.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      discordChannelId: true,
      discordChannels: {
        select: { id: true, discordChannelId: true, channelType: true },
      },
    },
  });

  const results: SyncResult[] = [];

  for (const project of projects) {
    try {
      const result = await syncSingleProject(client, guild, event.tenantId, project);
      results.push(result);
    } catch (err) {
      console.error("[channel-sync] Failed to sync project:", project.id, err);
      results.push({
        projectId: project.id,
        projectName: project.name,
        categoryId: null,
        channels: [],
        error: String(err),
      });
    }
  }

  return results;
}

async function syncSingleProject(
  _client: Client,
  guild: Guild,
  tenantId: string,
  project: {
    id: string;
    name: string;
    discordChannelId: string | null;
    discordChannels: { id: string; discordChannelId: string; channelType: string }[];
  }
): Promise<SyncResult> {
  const channelName = toChannelName(project.name);
  const existingTypes = new Set(project.discordChannels.map((c) => c.channelType));

  // Ensure guild channels are cached
  await guild.channels.fetch();

  // Create or find category for the project
  let categoryId: string | null = null;
  const existingCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === channelName.toLowerCase()
  );

  if (existingCategory) {
    categoryId = existingCategory.id;
  } else {
    const newCategory = await guild.channels
      .create({
        name: project.name,
        type: ChannelType.GuildCategory,
        reason: `Projekt-sync: ${project.name}`,
      })
      .catch((err: unknown) => {
        console.error("[channel-sync] Failed to create category:", err);
        return null;
      });
    categoryId = newCategory?.id ?? null;
  }

  const createdChannels: { type: string; channelId: string }[] = [];

  for (const channelType of PROJECT_CHANNEL_TYPES) {
    // Skip if already exists
    if (existingTypes.has(channelType)) {
      const existing = project.discordChannels.find((c) => c.channelType === channelType);
      if (existing) {
        createdChannels.push({ type: channelType, channelId: existing.discordChannelId });
      }
      continue;
    }

    const config = CHANNEL_CONFIG[channelType];
    const name = channelType === "general" ? channelName : `${channelName}${config.suffix}`;

    const channel = await guild.channels
      .create({
        name,
        type: ChannelType.GuildText,
        parent: categoryId ?? undefined,
        topic: config.topic,
        reason: `Projekt-sync: ${project.name} — ${channelType}`,
      })
      .catch((err: unknown) => {
        console.error(`[channel-sync] Failed to create ${channelType} channel:`, err);
        return null;
      });

    if (!channel) continue;

    // Save to database
    await prisma.discordProjectChannel.create({
      data: {
        discordChannelId: channel.id,
        discordCategoryId: categoryId,
        projectId: project.id,
        tenantId,
        channelType,
      },
    });

    createdChannels.push({ type: channelType, channelId: channel.id });

    // If this is the "general" channel, also set it as project's main discordChannelId
    if (channelType === "general" && !project.discordChannelId) {
      await prisma.project.update({
        where: { id: project.id },
        data: { discordChannelId: channel.id, discordChannelName: name },
      }).catch((err: unknown) => {
        console.error("[channel-sync] Failed to update project.discordChannelId:", err);
      });
    }
  }

  console.log(
    `[channel-sync] Synced project "${project.name}" — ${createdChannels.length} channels created/found`
  );

  return {
    projectId: project.id,
    projectName: project.name,
    categoryId,
    channels: createdChannels,
  };
}

/**
 * Get sync status for all projects in a tenant.
 */
export async function getProjectSyncStatus(
  tenantId: string
): Promise<{ projectId: string; projectName: string; channels: { type: string; channelId: string; syncEnabled: boolean }[] }[]> {
  const projects = await prisma.project.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      discordChannels: {
        select: {
          discordChannelId: true,
          channelType: true,
          syncEnabled: true,
        },
      },
    },
  });

  return projects.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    channels: p.discordChannels.map((c) => ({
      type: c.channelType,
      channelId: c.discordChannelId,
      syncEnabled: c.syncEnabled,
    })),
  }));
}
