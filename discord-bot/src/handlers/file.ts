/**
 * File & image handler — processes Discord attachments.
 * - Images: Downloads and sends to AI for vision analysis.
 * - Files: Uploads to S3/MinIO and creates a File record in the database.
 */
import type { Attachment, Message, TextChannel, DMChannel } from "discord.js";
import type { IdentifiedUser } from "../services/user-identification.js";
import type { ChannelContext } from "../services/context.js";
import { uploadToStorage, isStorageConfigured } from "../services/storage.js";
import { callAI } from "../services/ai-adapter.js";
import { sendWithThinking } from "../utils/streaming.js";
import { createFileEmbed, createErrorEmbed } from "../components/embeds.js";
import { prisma } from "../lib/prisma.js";

/** Image MIME types that support AI vision analysis. */
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Max file size for upload (50MB, matching web app). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Check if an attachment is an image suitable for AI vision.
 */
export function isImageAttachment(attachment: Attachment): boolean {
  if (attachment.contentType && IMAGE_TYPES.has(attachment.contentType)) {
    return true;
  }
  // Fallback: check file extension
  const ext = attachment.name?.toLowerCase().split(".").pop();
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif";
}

/**
 * Download a Discord attachment as a Buffer.
 */
async function downloadAttachment(attachment: Attachment): Promise<Buffer> {
  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Handle an image attachment by sending it to the AI for vision analysis.
 * Downloads the image, converts to base64, and sends as a vision message.
 */
export async function handleImageForAI(
  attachment: Attachment,
  message: Message,
  user: IdentifiedUser,
  channelContext: ChannelContext,
  textContent: string
): Promise<void> {
  const channel = message.channel as TextChannel | DMChannel;

  try {
    // Download the image
    const buffer = await downloadAttachment(attachment);
    const base64 = buffer.toString("base64");

    const mimeType = attachment.contentType ?? "image/jpeg";

    // Build the user message with text + image for vision
    const userText =
      textContent.trim() ||
      "Vad ser du i den här bilden? Beskriv den kort.";

    const response = await callAI({
      userId: user.userId,
      tenantId: user.tenantId,
      userName: user.userName,
      userRole: user.userRole,
      projectId: channelContext.projectId,
      messages: [
        {
          role: "user",
          content: userText,
          imageBase64: base64,
          imageMimeType: mimeType,
        },
      ],
    });

    if (!response.text?.trim()) {
      await message
        .reply("Jag kunde inte analysera bilden. Försök igen.")
        .catch(() => {});
      return;
    }

    await sendWithThinking(channel, response.text, message);
  } catch (error) {
    console.error("Image analysis error:", error);
    await message
      .reply({
        embeds: [
          createErrorEmbed(
            "Kunde inte analysera bilden.",
            error instanceof Error ? error.message : "Okänt fel"
          ),
        ],
      })
      .catch(() => {});
  }
}

/**
 * Handle a file attachment by uploading it to S3/MinIO.
 * Only available in project channels where the user has access.
 * Creates a File record in the database.
 */
export async function handleFileAttachment(
  attachment: Attachment,
  message: Message,
  user: IdentifiedUser,
  channelContext: ChannelContext
): Promise<void> {
  const channel = message.channel as TextChannel | DMChannel;

  // Validate storage is configured
  if (!isStorageConfigured()) {
    await message
      .reply({
        embeds: [
          createErrorEmbed(
            "Filuppladdning är inte konfigurerad.",
            "S3-lagring saknas i bot-konfigurationen."
          ),
        ],
      })
      .catch(() => {});
    return;
  }

  // Validate project context
  if (!channelContext.projectId) {
    await message
      .reply(
        "Filuppladdning till projekt fungerar bara i projektkanaler. " +
          "Skicka filen i rätt projektkanal så laddar jag upp den."
      )
      .catch(() => {});
    return;
  }

  // Validate file size
  if (attachment.size > MAX_FILE_SIZE) {
    await message
      .reply({
        embeds: [
          createErrorEmbed(
            "Filen är för stor.",
            `Max storlek: ${MAX_FILE_SIZE / 1024 / 1024}MB. Din fil: ${(attachment.size / 1024 / 1024).toFixed(1)}MB.`
          ),
        ],
      })
      .catch(() => {});
    return;
  }

  try {
    // Show typing indicator
    await channel.sendTyping();

    // Download from Discord CDN
    const buffer = await downloadAttachment(attachment);

    const contentType = attachment.contentType ?? "application/octet-stream";
    const filename = attachment.name ?? "file";

    // Upload to S3/MinIO
    const { bucket, key } = await uploadToStorage({
      buffer,
      filename,
      contentType,
      projectId: channelContext.projectId,
    });

    // Create File record in the database
    const file = await prisma.file.create({
      data: {
        name: filename,
        type: contentType,
        size: attachment.size,
        bucket,
        key,
        uploadedById: user.userId,
        projectId: channelContext.projectId,
      },
    });

    // Send confirmation embed
    const embed = createFileEmbed({
      id: file.id,
      filename,
      size: attachment.size,
      projectName: channelContext.projectName,
      uploadedBy: user.userName,
    });

    await message.reply({ embeds: [embed] }).catch(() => {});
  } catch (error) {
    console.error("File upload error:", error);
    await message
      .reply({
        embeds: [
          createErrorEmbed(
            "Kunde inte ladda upp filen.",
            error instanceof Error ? error.message : "Okänt fel"
          ),
        ],
      })
      .catch(() => {});
  }
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
