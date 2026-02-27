/**
 * Discord channel sync service.
 * Creates category + sub-channels (general, tasks, files, activity) for projects.
 * Triggered via Redis event from the web AI tool `syncDiscordChannels`.
 * Also syncs existing tasks and notes to the new channels.
 */
import type { Client, Guild, TextChannel } from "discord.js";
import { ChannelType, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma.js";
import { toChannelName } from "./channel.js";
import { createProjectHubEmbed } from "../components/embeds.js";
import { createProjectHubButtons } from "../components/buttons.js";

/** Channel types we create per project */
const PROJECT_CHANNEL_TYPES = ["general", "files", "activity"] as const;
type ProjectChannelType = (typeof PROJECT_CHANNEL_TYPES)[number];

const CHANNEL_CONFIG: Record<ProjectChannelType, { name: string; topic: string }> = {
  general: { name: "allmänt", topic: "AI-bot och uppgiftsnotiser — kopplad till projektet" },
  files: { name: "filer", topic: "Uppladdade filer postas här" },
  activity: { name: "aktivitet", topic: "Anteckningar, statusändringar och aktivitet" },
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
        select: { id: true, discordChannelId: true, discordCategoryId: true, channelType: true },
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
    discordChannels: { id: string; discordChannelId: string; discordCategoryId: string | null; channelType: string }[];
  }
): Promise<SyncResult> {
  const channelName = toChannelName(project.name);
  const existingTypes = new Set(project.discordChannels.map((c) => c.channelType));

  // Ensure guild channels are cached
  await guild.channels.fetch();

  // CRITICAL: First check if we already have a category saved in DB
  // This prevents duplicate categories on re-sync
  let categoryId: string | null = null;
  const savedCategoryId = project.discordChannels.find((c) => c.discordCategoryId)?.discordCategoryId;

  if (savedCategoryId) {
    // Verify the category still exists in Discord
    const existingCategory = guild.channels.cache.get(savedCategoryId);
    if (existingCategory && existingCategory.type === ChannelType.GuildCategory) {
      categoryId = savedCategoryId;
      console.log(`[channel-sync] Using existing category from DB: ${categoryId}`);
    } else {
      console.warn(`[channel-sync] Saved category ${savedCategoryId} no longer exists in Discord`);
    }
  }

  // Only create new category if we don't have a valid one
  if (!categoryId) {
    // Check if category with this name already exists (fallback)
    const existingCategory = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === channelName.toLowerCase()
    );

    if (existingCategory) {
      categoryId = existingCategory.id;
      console.log(`[channel-sync] Found existing category by name: ${categoryId}`);
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
      console.log(`[channel-sync] Created new category: ${categoryId}`);
    }
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
    // and send a pinned project hub message with action buttons.
    if (channelType === "general") {
      if (!project.discordChannelId) {
        await prisma.project.update({
          where: { id: project.id },
          data: { discordChannelId: channel.id, discordChannelName: name },
        }).catch((err: unknown) => {
          console.error("[channel-sync] Failed to update project.discordChannelId:", err);
        });
      }

      // Send and pin a project hub message with Skapa uppgift + Lista uppgifter
      await sendProjectHubMessage(channel as TextChannel, project.id, project.name);
    }
  }

  console.log(
    `[channel-sync] Synced project "${project.name}" — ${createdChannels.length} channels created/found`
  );

  // Sync initial content (tasks, notes) to the new channels
  await syncInitialContent(guild, project.id, createdChannels);

  return {
    projectId: project.id,
    projectName: project.name,
    categoryId,
    channels: createdChannels,
  };
}

/**
 * Send a persistent project hub message with action buttons and pin it.
 * This gives users a permanent way to create and list tasks in the channel.
 */
async function sendProjectHubMessage(
  channel: TextChannel,
  projectId: string,
  projectName: string
): Promise<void> {
  try {
    const embed = createProjectHubEmbed(projectName);
    const buttons = createProjectHubButtons(projectId);

    const message = await channel.send({
      embeds: [embed],
      components: buttons,
    });

    // Pin the hub message so it's always accessible
    await message.pin().catch(() => {
      console.warn("[channel-sync] Could not pin hub message, missing permission");
    });
  } catch (err) {
    console.error("[channel-sync] Failed to send project hub message:", err);
  }
}

/**
 * Sync existing tasks and notes to the newly created Discord channels.
 * This gives users immediate content when channels are first created.
 */
async function syncInitialContent(
  guild: Guild,
  projectId: string,
  channels: { type: string; channelId: string }[]
): Promise<void> {
  const tasksChannel = channels.find((c) => c.type === "tasks");
  const activityChannel = channels.find((c) => c.type === "activity");

  // Sync tasks to #uppgifter
  if (tasksChannel) {
    const channel = guild.channels.cache.get(tasksChannel.channelId) as TextChannel | undefined;
    if (channel) {
      const tasks = await prisma.task.findMany({
        where: { projectId, status: { not: "DONE" } },
        orderBy: { createdAt: "desc" },
        take: 20, // Limit to most recent 20
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          deadline: true,
        },
      });

      if (tasks.length > 0) {
        // Send summary embed
        const summaryEmbed = new EmbedBuilder()
          .setTitle("📋 Befintliga uppgifter")
          .setDescription(`Här är de ${tasks.length} senaste aktiva uppgifterna i projektet.`)
          .setColor(0x3b82f6)
          .setTimestamp();

        await channel.send({ embeds: [summaryEmbed] }).catch(() => {});

        // Send each task as an embed
        for (const task of tasks.slice(0, 10)) { // Limit to 10 to avoid spam
          const statusEmoji = task.status === "IN_PROGRESS" ? "🔄" : "📌";
          const priorityEmoji = task.priority === "URGENT" ? "🔴" : task.priority === "HIGH" ? "🟠" : "⚪";

          const taskEmbed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${task.title}`)
            .setDescription(task.description?.slice(0, 200) || "Ingen beskrivning")
            .addFields(
              { name: "Status", value: task.status, inline: true },
              { name: "Prioritet", value: `${priorityEmoji} ${task.priority}`, inline: true }
            )
            .setColor(task.status === "IN_PROGRESS" ? 0xf59e0b : 0x6b7280)
            .setFooter({ text: `ID: ${task.id}` });

          if (task.deadline) {
            taskEmbed.addFields({ name: "Deadline", value: new Date(task.deadline).toLocaleDateString("sv-SE"), inline: true });
          }

          await channel.send({ embeds: [taskEmbed] }).catch(() => {});
          // Small delay to avoid rate limiting
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }

  // Sync notes to #aktivitet
  if (activityChannel) {
    const channel = guild.channels.cache.get(activityChannel.channelId) as TextChannel | undefined;
    if (channel) {
      const notes = await prisma.note.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      });

      if (notes.length > 0) {
        const summaryEmbed = new EmbedBuilder()
          .setTitle("📝 Senaste anteckningar")
          .setDescription(`Här är de ${notes.length} senaste anteckningarna.`)
          .setColor(0x10b981)
          .setTimestamp();

        await channel.send({ embeds: [summaryEmbed] }).catch(() => {});

        for (const note of notes.slice(0, 5)) {
          const noteEmbed = new EmbedBuilder()
            .setTitle(`📝 ${note.title}`)
            .setDescription(note.content?.slice(0, 300) || "Inget innehåll")
            .setColor(0x10b981)
            .setFooter({ text: `Av ${note.createdBy?.name || "Okänd"} • ${new Date(note.createdAt).toLocaleDateString("sv-SE")}` });

          if (note.category) {
            noteEmbed.addFields({ name: "Kategori", value: note.category, inline: true });
          }

          await channel.send({ embeds: [noteEmbed] }).catch(() => {});
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }
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
