/**
 * Streaming utility — edit-pattern for Discord.
 * Sends an initial "thinking" message and edits it as the response comes in.
 * Since we use HTTP (non-streaming) from the AI adapter, this simulates
 * the pattern by showing a loading state then the final result.
 *
 * Also handles embedding images and attaching files found in the AI response.
 */
import { EmbedBuilder, type Message, type TextChannel, type DMChannel } from "discord.js";

const MAX_MESSAGE_LENGTH = 2000;

/** Image file extensions that should be shown as embeds. */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

/** File extensions that should be attached as files. */
const FILE_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".zip", ".txt"]);

/** Regex to find URLs in text (both raw and markdown links). */
const URL_REGEX = /https?:\/\/[^\s)>\]]+/gi;

/** Regex to find markdown image links: ![alt](url) */
const MD_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;

/** Regex to find markdown links: [text](url) */
const MD_LINK_REGEX = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;

interface ExtractedMedia {
  /** Image URLs to embed inline in Discord. */
  imageUrls: string[];
  /** File URLs to download and attach. */
  fileUrls: Array<{ url: string; filename: string }>;
  /** The text with image markdown converted to plain references. */
  cleanedText: string;
}

/**
 * Extract image and file URLs from AI response text.
 * Images will be shown as embeds, files will be attached.
 */
function extractMedia(text: string): ExtractedMedia {
  const imageUrls: string[] = [];
  const fileUrls: Array<{ url: string; filename: string }> = [];
  let cleanedText = text;

  // First: extract markdown images ![alt](url)
  const mdImageMatches = [...text.matchAll(MD_IMAGE_REGEX)];
  for (const match of mdImageMatches) {
    const url = match[2];
    const ext = getExtension(url);
    if (IMAGE_EXTENSIONS.has(ext)) {
      imageUrls.push(url);
      // Remove the markdown image syntax — the embed will show the image
      cleanedText = cleanedText.replace(match[0], "");
    }
  }

  // Second: extract markdown links [text](url) for files
  const mdLinkMatches = [...text.matchAll(MD_LINK_REGEX)];
  for (const match of mdLinkMatches) {
    const linkText = match[1];
    const url = match[2];
    const ext = getExtension(url);
    if (FILE_EXTENSIONS.has(ext)) {
      const filename = linkText || getFilenameFromUrl(url);
      fileUrls.push({ url, filename });
    } else if (IMAGE_EXTENSIONS.has(ext) && !imageUrls.includes(url)) {
      imageUrls.push(url);
      cleanedText = cleanedText.replace(match[0], "");
    }
  }

  // Third: find bare URLs not already captured
  const bareUrlMatches = [...cleanedText.matchAll(URL_REGEX)];
  for (const match of bareUrlMatches) {
    const url = match[0];
    const ext = getExtension(url);
    if (IMAGE_EXTENSIONS.has(ext) && !imageUrls.includes(url)) {
      imageUrls.push(url);
      cleanedText = cleanedText.replace(url, "");
    } else if (FILE_EXTENSIONS.has(ext) && !fileUrls.some((f) => f.url === url)) {
      fileUrls.push({ url, filename: getFilenameFromUrl(url) });
    }
  }

  // Clean up empty lines left by removed image references
  cleanedText = cleanedText.replace(/\n{3,}/g, "\n\n").trim();

  return { imageUrls, fileUrls, cleanedText };
}

/** Get lowercase file extension from a URL. */
function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf(".");
    if (lastDot === -1) return "";
    // Take extension up to any query param indicator
    return pathname.slice(lastDot).toLowerCase().split("?")[0];
  } catch {
    return "";
  }
}

/** Extract a filename from a URL path. */
function getFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "file");
  } catch {
    return "file";
  }
}

/**
 * Build Discord embeds for image URLs.
 */
function buildImageEmbeds(imageUrls: string[]): EmbedBuilder[] {
  return imageUrls.slice(0, 4).map((url) =>
    new EmbedBuilder().setImage(url).setColor(0x5865f2)
  );
}

/**
 * Try to fetch a file from URL and return it as an attachment buffer.
 * Returns null if fetch fails.
 */
async function fetchFileAsAttachment(
  url: string,
  filename: string
): Promise<{ attachment: Buffer; name: string } | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    // Discord has a file size limit (~25MB for most bots)
    if (buffer.length > 24 * 1024 * 1024) return null;

    return { attachment: buffer, name: filename };
  } catch (err) {
    console.warn(`[streaming] Failed to fetch file for attachment: ${url}`, err);
    return null;
  }
}

/**
 * Send an AI response to Discord with the edit-pattern.
 * 1. Sends initial "thinking" message
 * 2. Edits with the final AI response
 * 3. Adds image embeds and file attachments if URLs are found
 *
 * Handles edge cases:
 * - Channel deleted during processing
 * - User blocked the bot (DM errors)
 * - Message too long (splits into chunks)
 *
 * Returns the bot's message for future reference, or null if sending failed.
 */
export async function sendWithThinking(
  channel: TextChannel | DMChannel,
  responseText: string,
  replyTo?: Message
): Promise<Message | null> {
  let botMessage: Message;

  try {
    // Send initial thinking message
    botMessage = await channel.send({
      content: "\u{1F4AD} Tänker...",
      ...(replyTo && { reply: { messageReference: replyTo.id } }),
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 50007 = Cannot send messages to this user (blocked bot / DMs disabled)
    // 10003 = Unknown Channel (deleted)
    // 50001 = Missing Access
    if (code === 50007 || code === 10003 || code === 50001) {
      console.warn(`[streaming] Cannot send to channel (code ${code}), skipping.`);
      return null;
    }
    throw err;
  }

  // Extract media (images + files) from the response
  const { imageUrls, fileUrls, cleanedText } = extractMedia(responseText);
  const embeds = buildImageEmbeds(imageUrls);

  // Fetch file attachments in parallel
  const fileAttachments = (
    await Promise.all(
      fileUrls.map((f) => fetchFileAsAttachment(f.url, f.filename))
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  // Edit with final response
  try {
    if (cleanedText.length <= MAX_MESSAGE_LENGTH) {
      await botMessage.edit({
        content: cleanedText || null,
        embeds: embeds.length > 0 ? embeds : undefined,
        files: fileAttachments.length > 0 ? fileAttachments : undefined,
      });
    } else {
      // Split long responses across the initial message + follow-up messages
      const chunks = splitMessage(cleanedText);
      // First chunk gets the initial edit (no embeds/files yet)
      await botMessage.edit(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        await channel
          .send({
            content: chunks[i],
            // Attach embeds and files to the last chunk
            ...(isLast && embeds.length > 0 ? { embeds } : {}),
            ...(isLast && fileAttachments.length > 0
              ? { files: fileAttachments }
              : {}),
          })
          .catch((sendErr) => {
            console.warn("[streaming] Failed to send follow-up chunk:", sendErr);
          });
      }
      // If there's only one chunk and we have media, send media separately
      if (chunks.length === 1 && (embeds.length > 0 || fileAttachments.length > 0)) {
        await channel
          .send({
            embeds: embeds.length > 0 ? embeds : undefined,
            files: fileAttachments.length > 0 ? fileAttachments : undefined,
          })
          .catch((sendErr) => {
            console.warn("[streaming] Failed to send media:", sendErr);
          });
      }
    }
  } catch (editErr) {
    // If editing fails (e.g. message was deleted), try sending a fresh message
    console.warn("[streaming] Failed to edit message, trying fresh send:", editErr);
    try {
      if (cleanedText.length <= MAX_MESSAGE_LENGTH) {
        await channel.send({
          content: cleanedText,
          embeds: embeds.length > 0 ? embeds : undefined,
          files: fileAttachments.length > 0 ? fileAttachments : undefined,
        });
      } else {
        const chunks = splitMessage(cleanedText);
        for (let i = 0; i < chunks.length; i++) {
          const isLast = i === chunks.length - 1;
          await channel
            .send({
              content: chunks[i],
              ...(isLast && embeds.length > 0 ? { embeds } : {}),
              ...(isLast && fileAttachments.length > 0
                ? { files: fileAttachments }
                : {}),
            })
            .catch(() => {});
        }
      }
    } catch {
      console.error("[streaming] Failed to send response entirely.");
    }
  }

  return botMessage;
}

/**
 * Split a long message into chunks that fit within Discord's 2000 char limit.
 * Tries to split at paragraph boundaries first, then at line breaks.
 */
function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good split point
    let splitAt = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
