/**
 * Activity sync service: Webb→Discord.
 * Handles notes, files, and comments by posting embeds to the appropriate
 * project channels (#activity for notes, #files for files, #tasks for comments).
 */
import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma.js";
import { createFileEmbed, type FileEmbedData } from "../components/embeds.js";

const COLORS = {
  NOTE: 0x10b981, // Emerald
  FILE: 0x6366f1, // Indigo
  COMMENT: 0x6b7280, // Gray
} as const;

const WEB_APP_URL = process.env.WEB_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
const baseUrl = WEB_APP_URL.replace(/\/$/, "");

/**
 * Find a specific channel type for a project.
 */
async function getProjectSyncChannel(
  client: Client,
  projectId: string,
  channelType: string
): Promise<TextChannel | null> {
  const channel = await prisma.discordProjectChannel.findFirst({
    where: { projectId, channelType, syncEnabled: true },
    select: { discordChannelId: true },
  });

  if (!channel) return null;

  const discordChannel = await client.channels.fetch(channel.discordChannelId).catch(() => null);
  if (!discordChannel || !discordChannel.isTextBased() || discordChannel.isDMBased()) return null;

  return discordChannel as TextChannel;
}

// ─── Notes ─────────────────────────────────────────────────────────────

export interface NoteCreatedSyncEvent {
  noteId: string;
  projectId: string;
  tenantId: string;
  title: string;
  content?: string;
  category?: string | null;
  createdByName?: string;
}

export interface NoteUpdatedSyncEvent {
  noteId: string;
  projectId: string;
  tenantId: string;
  title: string;
  content?: string;
  updatedByName?: string;
}

export async function handleNoteCreatedSync(
  client: Client,
  event: NoteCreatedSyncEvent
): Promise<void> {
  const channel = await getProjectSyncChannel(client, event.projectId, "activity");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.NOTE)
    .setTitle(`📝 Ny anteckning: ${event.title || "Utan titel"}`)
    .setURL(`${baseUrl}/sv/projects/${event.projectId}/notes`)
    .setTimestamp();

  if (event.content) {
    const preview = event.content.length > 300 ? event.content.slice(0, 300) + "..." : event.content;
    embed.setDescription(preview);
  }
  if (event.category) {
    embed.addFields({ name: "Kategori", value: event.category, inline: true });
  }
  if (event.createdByName) {
    embed.setFooter({ text: `Skapad av ${event.createdByName}` });
  }

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error("[activity-sync] Failed to send note created embed:", err);
  });
}

export async function handleNoteUpdatedSync(
  client: Client,
  event: NoteUpdatedSyncEvent
): Promise<void> {
  const channel = await getProjectSyncChannel(client, event.projectId, "activity");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.NOTE)
    .setTitle(`✏️ Anteckning uppdaterad: ${event.title || "Utan titel"}`)
    .setURL(`${baseUrl}/sv/projects/${event.projectId}/notes`)
    .setTimestamp();

  if (event.content) {
    const preview = event.content.length > 300 ? event.content.slice(0, 300) + "..." : event.content;
    embed.setDescription(preview);
  }
  if (event.updatedByName) {
    embed.setFooter({ text: `Uppdaterad av ${event.updatedByName}` });
  }

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error("[activity-sync] Failed to send note updated embed:", err);
  });
}

// ─── Files ─────────────────────────────────────────────────────────────

export interface FileUploadedSyncEvent {
  fileId: string;
  projectId: string;
  tenantId: string;
  fileName: string;
  fileSize: number;
  uploadedByName?: string;
}

export async function handleFileUploadedSync(
  client: Client,
  event: FileUploadedSyncEvent
): Promise<void> {
  const channel = await getProjectSyncChannel(client, event.projectId, "files");
  if (!channel) return;

  const project = await prisma.project.findUnique({
    where: { id: event.projectId },
    select: { name: true },
  });

  const fileData: FileEmbedData = {
    id: event.fileId,
    filename: event.fileName,
    size: event.fileSize,
    projectName: project?.name,
    uploadedBy: event.uploadedByName,
  };

  const embed = createFileEmbed(fileData)
    .setColor(COLORS.FILE)
    .setURL(`${baseUrl}/sv/projects/${event.projectId}/files`)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error("[activity-sync] Failed to send file uploaded embed:", err);
  });
}

// ─── Comments ──────────────────────────────────────────────────────────

export interface CommentAddedSyncEvent {
  commentId: string;
  taskId: string;
  projectId: string;
  tenantId: string;
  authorName: string;
  preview: string;
  taskTitle?: string;
}

export async function handleCommentAddedSync(
  client: Client,
  event: CommentAddedSyncEvent
): Promise<void> {
  // Comments go to the tasks channel
  const channel = await getProjectSyncChannel(client, event.projectId, "tasks");
  if (!channel) return;

  const preview = event.preview.length > 200 ? event.preview.slice(0, 200) + "..." : event.preview;

  const embed = new EmbedBuilder()
    .setColor(COLORS.COMMENT)
    .setTitle("💬 Ny kommentar")
    .setDescription(preview)
    .setURL(`${baseUrl}/sv/projects/${event.projectId}?task=${event.taskId}`)
    .setTimestamp();

  if (event.taskTitle) {
    embed.addFields({ name: "Uppgift", value: event.taskTitle, inline: true });
  }
  embed.setFooter({ text: `Av ${event.authorName}` });

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error("[activity-sync] Failed to send comment added embed:", err);
  });
}
