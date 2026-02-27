/**
 * Task sync service: Webb→Discord.
 * Handles task CRUD events by creating/updating/archiving threads or embeds
 * in the project's #uppgifter channel.
 */
import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma.js";
import { createTaskEmbed, type TaskEmbedData } from "../components/embeds.js";
import { createTaskButtons, createTimeButtons, createTaskCreateButton } from "../components/buttons.js";

const COLORS = {
  CREATED: 0x3b82f6, // Blue
  UPDATED: 0xf59e0b, // Yellow
  DELETED: 0xef4444, // Red
  ASSIGNED: 0x8b5cf6, // Purple
} as const;

const WEB_APP_URL = process.env.WEB_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
const baseUrl = WEB_APP_URL.replace(/\/$/, "");

function taskUrl(projectId: string, taskId: string): string {
  return `${baseUrl}/sv/projects/${projectId}?task=${taskId}`;
}

export interface TaskCreatedSyncEvent {
  taskId: string;
  projectId: string;
  tenantId: string;
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  deadline?: string | null;
  createdByName?: string;
}

export interface TaskUpdatedSyncEvent {
  taskId: string;
  projectId: string;
  tenantId: string;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  deadline?: string | null;
  updatedByName?: string;
}

export interface TaskDeletedSyncEvent {
  taskId: string;
  projectId: string;
  tenantId: string;
}

export interface TaskAssignedSyncEvent {
  taskId: string;
  projectId: string;
  tenantId: string;
  assigneeUserId: string;
  assigneeName?: string;
  taskTitle?: string;
}

/**
 * Find the tasks channel for a project.
 */
async function getTasksChannel(
  client: Client,
  projectId: string
): Promise<TextChannel | null> {
  const channel = await prisma.discordProjectChannel.findFirst({
    where: { projectId, channelType: "general", syncEnabled: true },
    select: { discordChannelId: true },
  });

  if (!channel) return null;

  const discordChannel = await client.channels.fetch(channel.discordChannelId).catch(() => null);
  if (!discordChannel || !discordChannel.isTextBased() || discordChannel.isDMBased()) return null;

  return discordChannel as TextChannel;
}

/**
 * Handle task created — post embed in tasks channel.
 */
export async function handleTaskCreatedSync(
  client: Client,
  event: TaskCreatedSyncEvent
): Promise<void> {
  const channel = await getTasksChannel(client, event.projectId);
  if (!channel) return;

  const project = await prisma.project.findUnique({
    where: { id: event.projectId },
    select: { name: true },
  });

  const taskData: TaskEmbedData = {
    id: event.taskId,
    title: event.title,
    description: event.description ?? null,
    status: event.status ?? "TODO",
    priority: event.priority ?? "MEDIUM",
    deadline: event.deadline ?? null,
    projectName: project?.name,
    createdBy: event.createdByName,
  };

  const embed = createTaskEmbed(taskData)
    .setColor(COLORS.CREATED)
    .setURL(taskUrl(event.projectId, event.taskId))
    .setTitle(`📋 Ny uppgift: ${event.title}`)
    .setTimestamp();

  const taskButtons = createTaskButtons(event.taskId);
  const secondRow = createTimeButtons(event.taskId);
  const createRow = createTaskCreateButton(event.projectId);

  try {
    const sentMessage = await channel.send({
      embeds: [embed],
      components: [taskButtons, secondRow, createRow],
    });

    await prisma.discordTaskMessage.create({
      data: {
        taskId: event.taskId,
        discordMessageId: sentMessage.id,
        discordChannelId: channel.id,
      },
    });
  } catch (err) {
    console.error("[task-sync] Failed to send task created embed:", err);
  }
}

/**
 * Handle task updated — post update embed in tasks channel.
 */
export async function handleTaskUpdatedSync(
  client: Client,
  event: TaskUpdatedSyncEvent
): Promise<void> {
  const channel = await getTasksChannel(client, event.projectId);
  if (!channel) return;

  const title = event.title ?? event.taskId;
  const statusEmoji = event.status === "DONE" ? "✅" : event.status === "IN_PROGRESS" ? "🔄" : "📋";

  const embed = new EmbedBuilder()
    .setColor(COLORS.UPDATED)
    .setTitle(`${statusEmoji} Uppgift uppdaterad: ${title}`)
    .setURL(taskUrl(event.projectId, event.taskId))
    .setTimestamp();

  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (event.status) {
    const statusLabel = event.status === "TODO" ? "Att göra" : event.status === "IN_PROGRESS" ? "Pågående" : "Klar";
    fields.push({ name: "Status", value: statusLabel, inline: true });
  }
  if (event.priority) {
    fields.push({ name: "Prioritet", value: event.priority, inline: true });
  }
  if (event.deadline) {
    fields.push({ name: "Deadline", value: new Date(event.deadline).toLocaleDateString("sv-SE"), inline: true });
  }
  if (fields.length > 0) {
    embed.addFields(fields);
  }
  if (event.description) {
    embed.setDescription(event.description.slice(0, 200));
  }
  if (event.updatedByName) {
    embed.setFooter({ text: `Uppdaterad av ${event.updatedByName}` });
  }

  const taskButtons = createTaskButtons(event.taskId);

  try {
    // Delete old Discord message if one exists
    const existingMsg = await prisma.discordTaskMessage.findFirst({
      where: { taskId: event.taskId },
    });
    if (existingMsg) {
      await channel.messages.delete(existingMsg.discordMessageId).catch(() => {
        // Old message may already be deleted
      });
    }

    // Send new message
    const sentMessage = await channel.send({
      embeds: [embed],
      components: [taskButtons],
    });

    // Upsert the DiscordTaskMessage record
    if (existingMsg) {
      await prisma.discordTaskMessage.update({
        where: { id: existingMsg.id },
        data: {
          discordMessageId: sentMessage.id,
          discordChannelId: channel.id,
        },
      });
    } else {
      await prisma.discordTaskMessage.create({
        data: {
          taskId: event.taskId,
          discordMessageId: sentMessage.id,
          discordChannelId: channel.id,
        },
      });
    }
  } catch (err) {
    console.error("[task-sync] Failed to send task updated embed:", err);
  }
}

/**
 * Handle task deleted — post notification in tasks channel.
 */
export async function handleTaskDeletedSync(
  client: Client,
  event: TaskDeletedSyncEvent
): Promise<void> {
  const channel = await getTasksChannel(client, event.projectId);
  if (!channel) return;

  try {
    // Delete the old task message from Discord if one exists
    const existingMsg = await prisma.discordTaskMessage.findFirst({
      where: { taskId: event.taskId },
    });
    if (existingMsg) {
      await channel.messages.delete(existingMsg.discordMessageId).catch(() => {
        // Old message may already be deleted
      });
      await prisma.discordTaskMessage.delete({
        where: { id: existingMsg.id },
      });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.DELETED)
      .setTitle("🗑️ Uppgift borttagen")
      .setDescription(`Uppgift \`${event.taskId}\` har tagits bort.`)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("[task-sync] Failed to send task deleted embed:", err);
  }
}

/**
 * Handle task assigned — post in tasks channel + notify assignee.
 */
export async function handleTaskAssignedSync(
  client: Client,
  event: TaskAssignedSyncEvent
): Promise<void> {
  const channel = await getTasksChannel(client, event.projectId);
  if (!channel) return;

  const title = event.taskTitle ?? event.taskId;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ASSIGNED)
    .setTitle(`👤 Uppgift tilldelad: ${title}`)
    .setURL(taskUrl(event.projectId, event.taskId))
    .setTimestamp();

  if (event.assigneeName) {
    embed.addFields({ name: "Tilldelad till", value: event.assigneeName, inline: true });
  }

  const taskButtons = createTaskButtons(event.taskId);

  await channel.send({
    embeds: [embed],
    components: [taskButtons],
  }).catch((err) => {
    console.error("[task-sync] Failed to send task assigned embed:", err);
  });

  // DM the assignee if they have Discord linked
  if (event.assigneeUserId) {
    const account = await prisma.account.findFirst({
      where: { userId: event.assigneeUserId, provider: "discord" },
      select: { providerAccountId: true },
    });
    if (account?.providerAccountId) {
      try {
        const user = await client.users.fetch(account.providerAccountId);
        const dmEmbed = new EmbedBuilder()
          .setColor(COLORS.ASSIGNED)
          .setTitle("📋 Du har tilldelats en uppgift")
          .setDescription(`**${title}**`)
          .setURL(taskUrl(event.projectId, event.taskId))
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      } catch (err) {
        console.warn("[task-sync] Could not DM assignee:", err);
      }
    }
  }
}
