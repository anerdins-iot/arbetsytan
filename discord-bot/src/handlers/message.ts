/**
 * AI message handler — processes Discord messages and sends them to the AI.
 * Converts Discord context to AI messages format, calls the AI adapter,
 * and sends the response back to Discord.
 *
 * Supports file/image attachments:
 * - Images are sent to AI for vision analysis
 * - Files in project channels are uploaded to S3/MinIO
 */
import type { Message, TextChannel, DMChannel } from "discord.js";
import type { IdentifiedUser } from "../services/user-identification.js";
import type { ChannelContext, MessageContext } from "../services/context.js";
import { callAI } from "../services/ai-adapter.js";
import { sendWithThinking } from "../utils/streaming.js";
import { prisma } from "../lib/prisma.js";
import {
  createAIUnavailableEmbed,
  createGenericErrorEmbed,
} from "../components/error-embeds.js";
import {
  isImageAttachment,
  handleImageForAI,
  handleFileAttachment,
} from "./file.js";

/** Map to store conversation IDs per channel/DM for continuity. */
const conversationCache = new Map<string, string>();

/**
 * Get a cache key for conversation lookup.
 * For DMs: uses the Discord user ID.
 * For guild channels: uses the channel ID.
 */
function getConversationKey(message: Message): string {
  if (!message.guildId) {
    return `dm:${message.author.id}`;
  }
  return `channel:${message.channel.id}`;
}

/**
 * Safely reply to a message, catching errors from blocked DMs or deleted channels.
 */
async function safeReply(
  message: Message,
  content: Parameters<Message["reply"]>[0]
): Promise<void> {
  try {
    await message.reply(content);
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 50007 = Cannot send messages to this user (blocked bot)
    // 10003 = Unknown Channel (deleted channel)
    // 50001 = Missing Access
    if (code === 50007) {
      console.warn(`[message] Cannot DM user ${message.author.id} (blocked bot or DMs disabled)`);
    } else if (code === 10003) {
      console.warn(`[message] Channel ${message.channel.id} no longer exists`);
    } else if (code === 50001) {
      console.warn(`[message] Missing access to channel ${message.channel.id}`);
    } else {
      console.error("[message] Failed to reply:", err);
    }
  }
}

/**
 * Handle an AI message from Discord.
 * Detects attachments (images/files), then converts context, calls AI,
 * and sends the response.
 */
export async function handleAIMessage(
  message: Message,
  user: IdentifiedUser,
  channelContext: ChannelContext,
  messageContext: MessageContext[]
): Promise<void> {
  const channel = message.channel as TextChannel | DMChannel;

  // Handle attachments: images go to AI vision, files go to S3 upload
  const attachments = [...message.attachments.values()];
  if (attachments.length > 0) {
    const imageAttachments = attachments.filter(isImageAttachment);
    const fileAttachments = attachments.filter((a) => !isImageAttachment(a));

    // Process images via AI vision
    if (imageAttachments.length > 0) {
      const textContent = message.content
        .replace(/<@!?\d+>/g, "")
        .trim();

      // Send typing indicator
      await channel.sendTyping().catch(() => {});

      // Process the first image (AI vision typically handles one at a time)
      await handleImageForAI(
        imageAttachments[0],
        message,
        user,
        channelContext,
        textContent
      );

      // If there are also non-image files, upload them
      for (const file of fileAttachments) {
        await handleFileAttachment(file, message, user, channelContext);
      }

      return;
    }

    // Non-image files: upload to S3 if in project channel
    if (fileAttachments.length > 0) {
      for (const file of fileAttachments) {
        await handleFileAttachment(file, message, user, channelContext);
      }

      // If there's also text, continue to AI processing below
      if (!message.content.replace(/<@!?\d+>/g, "").trim()) {
        return;
      }
    }
  }

  // Convert Discord message context to AI messages format
  const aiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Add recent message context (excludes current message, which is the last in context)
  for (const m of messageContext) {
    if (!m.content.trim()) continue;

    // Messages from the bot are "assistant", everything else is "user"
    const isBot = m.author === message.client.user?.username;
    aiMessages.push({
      role: isBot ? "assistant" : "user",
      content: isBot ? m.content : `[${m.author}]: ${m.content}`,
    });
  }

  // Add the current message
  if (message.content.trim()) {
    // Strip the bot mention from the message content
    const cleanContent = message.content
      .replace(/<@!?\d+>/g, "")
      .trim();

    if (cleanContent) {
      aiMessages.push({
        role: "user",
        content: cleanContent,
      });
    }
  }

  if (aiMessages.length === 0 || aiMessages[aiMessages.length - 1].role !== "user") {
    // No user message to process
    return;
  }

  // Look up existing conversation ID from cache or DB
  const cacheKey = getConversationKey(message);
  let conversationId = conversationCache.get(cacheKey);

  // If not cached, try to find an existing Discord conversation in DB
  if (!conversationId) {
    const existing = await findExistingConversation(message, user.userId);
    if (existing) {
      conversationId = existing;
      conversationCache.set(cacheKey, conversationId);
    }
  }

  try {
    // Show typing indicator while waiting for AI
    console.log(`[handleAIMessage] Starting AI call for user ${user.userId}`);
    await channel.sendTyping().catch(() => {});

    const response = await callAI({
      userId: user.userId,
      tenantId: user.tenantId,
      userName: user.userName,
      userRole: user.userRole,
      projectId: channelContext.projectId,
      conversationId,
      messages: aiMessages,
    });

    // Cache the conversation ID for future messages
    conversationCache.set(cacheKey, response.conversationId);

    // Update the conversation with Discord metadata (skip for guest users)
    if (!response.conversationId.startsWith("guest-conv-")) {
      await updateConversationDiscordMetadata(
        response.conversationId,
        message
      ).catch((err) =>
        console.error("Failed to update conversation Discord metadata:", err)
      );
    }

    console.log(`[handleAIMessage] Got response: ${response.text?.substring(0, 50)}...`);

    if (!response.text?.trim()) {
      await safeReply(message, "Jag kunde inte generera ett svar. Försök igen.");
      return;
    }

    // Send the response using the edit-pattern (handles long messages via splitting)
    console.log(`[handleAIMessage] Sending response to Discord...`);
    await sendWithThinking(channel, response.text, message);
    console.log(`[handleAIMessage] Response sent successfully`);
  } catch (error) {
    console.error("AI error:", error);

    const isServiceUnavailable =
      error instanceof Error &&
      (error.message.includes("503") ||
        error.message.includes("timeout") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("AbortError"));

    if (isServiceUnavailable) {
      await safeReply(message, { embeds: [createAIUnavailableEmbed()] });
    } else {
      await safeReply(message, { embeds: [createGenericErrorEmbed()] });
    }
  }
}

/**
 * Find an existing conversation for this Discord context.
 */
async function findExistingConversation(
  message: Message,
  userId: string
): Promise<string | null> {
  const isDM = !message.guildId;

  const conversation = await prisma.conversation.findFirst({
    where: isDM
      ? { discordUserId: message.author.id, userId }
      : { discordChannelId: message.channel.id, userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  return conversation?.id ?? null;
}

/**
 * Update conversation with Discord metadata for future lookups.
 */
async function updateConversationDiscordMetadata(
  conversationId: string,
  message: Message
): Promise<void> {
  const isDM = !message.guildId;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: isDM
      ? { discordUserId: message.author.id }
      : { discordChannelId: message.channel.id },
  });
}
