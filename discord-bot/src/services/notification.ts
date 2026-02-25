/**
 * Discord notification service.
 * Sends rich embeds to project channels (and DMs for task assignments) when events are received via Redis.
 */
import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma.js";
import {
  createTaskEmbed,
  createFileEmbed,
  createTimeEntryEmbed,
  type TaskEmbedData,
  type FileEmbedData,
  type TimeEntryEmbedData,
} from "../components/embeds.js";

const COLORS = {
  TASK_CREATED: 0x3b82f6, // Blue
  TASK_ASSIGNED: 0xf59e0b, // Yellow
  TASK_COMPLETED: 0x22c55e, // Green
  COMMENT: 0x6b7280, // Gray
  FILE: 0x8b5cf6, // Purple
  TIME: 0x06b6d4, // Cyan
} as const;

const WEB_APP_URL = process.env.WEB_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
const baseUrl = WEB_APP_URL.replace(/\/$/, "");

function projectUrl(projectId: string): string {
  return `${baseUrl}/sv/projects/${projectId}`;
}

function taskUrl(projectId: string, taskId: string): string {
  return `${baseUrl}/sv/projects/${projectId}?task=${taskId}`;
}

export interface TaskNotificationPayload {
  taskId: string;
  projectId: string;
  tenantId: string;
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  deadline?: string | null;
  createdBy?: string;
  assigneeUserId?: string;
  assigneeName?: string;
  completedBy?: string;
  completedByName?: string;
}

export interface CommentNotificationPayload {
  commentId: string;
  taskId: string;
  projectId: string;
  tenantId: string;
  authorName: string;
  preview: string;
  taskTitle?: string;
}

export interface FileNotificationPayload {
  fileId: string;
  projectId: string;
  tenantId: string;
  fileName: string;
  fileSize: number;
  uploadedByName?: string;
}

export interface TimeEntryNotificationPayload {
  timeEntryId: string;
  projectId: string;
  tenantId: string;
  minutes: number;
  date: string;
  description?: string | null;
  taskTitle?: string | null;
  userName?: string;
}

async function getProjectChannel(projectId: string): Promise<{
  channelId: string;
  guildId: string;
  projectName: string;
} | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      discordChannelId: true,
      name: true,
      tenant: { select: { discordGuildId: true } },
    },
  });
  if (!project?.discordChannelId || !project.tenant.discordGuildId) {
    return null;
  }
  return {
    channelId: project.discordChannelId,
    guildId: project.tenant.discordGuildId,
    projectName: project.name,
  };
}

async function sendToProjectChannel(
  client: Client,
  projectId: string,
  embed: EmbedBuilder
): Promise<boolean> {
  const meta = await getProjectChannel(projectId);
  if (!meta) return false;

  const channel = await client.channels.fetch(meta.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;

  await (channel as TextChannel).send({ embeds: [embed] }).catch((err) => {
    console.error("[notification] Failed to send to project channel:", err);
  });
  return true;
}

/**
 * Send task notification (created, assigned, or completed) to project channel.
 * For "assigned", also sends a DM to the assignee if they have Discord linked.
 */
export async function sendTaskNotification(
  client: Client,
  payload: TaskNotificationPayload,
  type: "created" | "assigned" | "completed"
): Promise<void> {
  const meta = await getProjectChannel(payload.projectId);
  if (!meta) {
    console.log("[notification] No Discord channel for project", payload.projectId);
    return;
  }

  const taskData: TaskEmbedData = {
    id: payload.taskId,
    title: payload.title,
    description: payload.description ?? null,
    status: payload.status ?? (type === "completed" ? "DONE" : type === "assigned" ? "IN_PROGRESS" : "TODO"),
    priority: payload.priority ?? "MEDIUM",
    deadline: payload.deadline ?? null,
    projectName: meta.projectName,
    createdBy: payload.createdBy ?? undefined,
    assignees: payload.assigneeName ? [payload.assigneeName] : undefined,
  };

  let embed: EmbedBuilder;
  const link = taskUrl(payload.projectId, payload.taskId);

  if (type === "created") {
    embed = createTaskEmbed(taskData).setColor(COLORS.TASK_CREATED);
    if (payload.createdBy) {
      embed.setFooter({ text: `Skapad av ${payload.createdBy}` });
    }
  } else if (type === "assigned") {
    embed = createTaskEmbed(taskData).setColor(COLORS.TASK_ASSIGNED);
    embed.setTitle(`📋 Uppgift tilldelad: ${payload.title}`);
    if (payload.assigneeName) {
      embed.setFooter({ text: `Tilldelad till ${payload.assigneeName}` });
    }
  } else {
    embed = createTaskEmbed(taskData).setColor(COLORS.TASK_COMPLETED);
    embed.setTitle(`✅ Uppgift slutförd: ${payload.title}`);
    if (payload.completedByName) {
      embed.setFooter({ text: `Slutförd av ${payload.completedByName}` });
    }
  }

  embed.setURL(link).setTimestamp();

  await sendToProjectChannel(client, payload.projectId, embed);

  // DM assignee when task is assigned (if they have Discord linked)
  if (type === "assigned" && payload.assigneeUserId) {
    const account = await prisma.account.findFirst({
      where: { userId: payload.assigneeUserId, provider: "discord" },
      select: { providerAccountId: true },
    });
    if (account?.providerAccountId) {
      try {
        const user = await client.users.fetch(account.providerAccountId);
        const dmEmbed = new EmbedBuilder()
          .setColor(COLORS.TASK_ASSIGNED)
          .setTitle(`📋 Du har tilldelats en uppgift`)
          .setDescription(`**${payload.title}**`)
          .addFields({
            name: "Projekt",
            value: meta.projectName,
            inline: true,
          })
          .setURL(link)
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      } catch (err) {
        console.warn("[notification] Could not DM assignee:", err);
      }
    }
  }
}

/**
 * Send comment notification to project channel.
 */
export async function sendCommentNotification(
  client: Client,
  payload: CommentNotificationPayload
): Promise<void> {
  const meta = await getProjectChannel(payload.projectId);
  if (!meta) return;

  const preview =
    payload.preview.length > 200 ? payload.preview.slice(0, 200) + "..." : payload.preview;
  const embed = new EmbedBuilder()
    .setColor(COLORS.COMMENT)
    .setTitle("💬 Ny kommentar")
    .setDescription(preview)
    .addFields(
      { name: "Uppgift", value: payload.taskTitle ?? payload.taskId, inline: true },
      { name: "Projekt", value: meta.projectName, inline: true }
    )
    .setFooter({ text: `Av ${payload.authorName}` })
    .setURL(taskUrl(payload.projectId, payload.taskId))
    .setTimestamp();

  await sendToProjectChannel(client, payload.projectId, embed);
}

/**
 * Send file upload notification to project channel.
 */
export async function sendFileNotification(
  client: Client,
  payload: FileNotificationPayload
): Promise<void> {
  const meta = await getProjectChannel(payload.projectId);
  if (!meta) return;

  const fileData: FileEmbedData = {
    id: payload.fileId,
    filename: payload.fileName,
    size: payload.fileSize,
    projectName: meta.projectName,
    uploadedBy: payload.uploadedByName,
  };

  const embed = createFileEmbed(fileData)
    .setColor(COLORS.FILE)
    .setURL(projectUrl(payload.projectId))
    .setTimestamp();

  await sendToProjectChannel(client, payload.projectId, embed);
}

/**
 * Send time entry notification to project channel (optional; can be noisy).
 */
export async function sendTimeEntryNotification(
  client: Client,
  payload: TimeEntryNotificationPayload
): Promise<void> {
  const meta = await getProjectChannel(payload.projectId);
  if (!meta) return;

  const entryData: TimeEntryEmbedData = {
    id: payload.timeEntryId,
    minutes: payload.minutes,
    date: payload.date,
    description: payload.description ?? null,
    taskTitle: payload.taskTitle ?? undefined,
    projectName: meta.projectName,
    userName: payload.userName,
  };

  const embed = createTimeEntryEmbed(entryData)
    .setColor(COLORS.TIME)
    .setURL(projectUrl(payload.projectId) + "/time")
    .setTimestamp();

  await sendToProjectChannel(client, payload.projectId, embed);
}
