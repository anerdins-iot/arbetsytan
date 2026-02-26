/**
 * POST /api/internal/discord-chat — Internal endpoint for Discord bot AI chat.
 * Authenticated via INTERNAL_API_KEY header. Not for external use.
 *
 * Receives: userId, tenantId, projectId, messages, conversationId
 * Returns: full text response (non-streaming) with tool results.
 *
 * Uses shared-core executeAIChat() to leverage the same AI pipeline as the web app.
 */
import { NextRequest, NextResponse } from "next/server";
import { userDb, tenantDb } from "@/lib/db";
import {
  executeAIChat,
  saveUserMessage,
  saveAssistantMessage,
} from "@/lib/ai/shared-core";
import type { ProviderKey } from "@/lib/ai/providers";
import type { UIMessage } from "ai";
import { logger } from "@/lib/logger";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface DiscordChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Base64-encoded image for vision analysis (sent from Discord bot). */
  imageBase64?: string;
  /** MIME type of the image (e.g. "image/jpeg"). */
  imageMimeType?: string;
}

interface DiscordChatRequest {
  userId: string;
  tenantId: string;
  userName?: string;
  userRole: string;
  projectId?: string;
  conversationId?: string;
  /** Whether this is a DM (direct message) vs a guild channel message. */
  isDM?: boolean;
  provider?: ProviderKey;
  messages: DiscordChatMessage[];
}

interface DiscordChatResponse {
  text: string;
  conversationId: string;
  provider: string;
}

function validateApiKey(req: NextRequest): boolean {
  if (!INTERNAL_API_KEY) {
    logger.error("INTERNAL_API_KEY not configured");
    return false;
  }
  const key = req.headers.get("x-internal-api-key");
  return key === INTERNAL_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DiscordChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    userId,
    tenantId,
    userName,
    userRole,
    projectId,
    conversationId,
    isDM,
    provider,
    messages,
  } = body;

  if (!userId || !tenantId || !userRole || !messages?.length) {
    return NextResponse.json(
      { error: "Missing required fields: userId, tenantId, userRole, messages" },
      { status: 400 }
    );
  }

  const udb = userDb(userId, {});

  // Check if this is a guest user (no database record)
  const isGuestUser = userId.startsWith("guest-");

  logger.info("Discord chat request", {
    userId,
    isGuestUser,
    tenantId,
    hasConversationId: !!conversationId,
  });

  try {
    // Get or create conversation for this Discord user
    // Skip conversation persistence for guest users
    let activeConversationId: string = conversationId ?? "";
    let conversationSummary: string | null = null;

    if (!isGuestUser) {
      if (!activeConversationId) {
        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        const title = lastUserMsg
          ? lastUserMsg.content.slice(0, 100)
          : "Discord-konversation";

        const conversation = await udb.conversation.create({
          data: {
            type: "PERSONAL",
            title,
            provider: "CLAUDE_HAIKU",
            userId,
            projectId: projectId ?? null,
          },
        });
        activeConversationId = conversation.id;
      } else {
        const existing = await udb.conversation.findFirst({
          where: { id: activeConversationId },
          select: { id: true, summary: true },
        });
        if (!existing) {
          return NextResponse.json(
            { error: "Conversation not found" },
            { status: 404 }
          );
        }
        conversationSummary = existing.summary;
      }
    } else {
      // Guest user: use a temporary conversation ID, don't persist
      activeConversationId = `guest-conv-${Date.now()}`;
    }

    // Collect image data URLs from messages for vision support
    const imageDataUrls: string[] = [];
    for (const m of messages) {
      if (m.imageBase64 && m.imageMimeType) {
        imageDataUrls.push(`data:${m.imageMimeType};base64,${m.imageBase64}`);
      }
    }

    // Convert simple messages to UIMessage format for shared-core
    const uiMessages: UIMessage[] = messages.map((m, i) => ({
      id: `discord-${i}`,
      role: m.role,
      content: m.content,
      parts: [{ type: "text" as const, text: m.content }],
    }));

    // Save the latest user message (skip for guest users)
    const lastUserMessage = uiMessages.filter((m) => m.role === "user").pop();
    if (lastUserMessage && !isGuestUser) {
      await saveUserMessage({
        udb,
        message: lastUserMessage,
        conversationId: activeConversationId,
        tenantId,
        userId,
        projectId: projectId ?? null,
      });
    }

    // Execute AI chat via shared core (with optional inline images from Discord)
    const result = await executeAIChat({
      context: {
        tenantId,
        userId,
        userName,
        userRole,
        projectId: projectId ?? null,
        conversationId: activeConversationId,
        conversationType: "PERSONAL",
        isDiscordDM: isDM,
      },
      messages: uiMessages,
      // Default to Claude Haiku for Discord (faster, more reliable than Gemini Flash)
      provider: (provider as ProviderKey | undefined) ?? "CLAUDE_HAIKU",
      conversationSummary,
      ...(imageDataUrls.length > 0 && { inlineImageDataUrls: imageDataUrls }),
    });

    // Await the full text response (non-streaming for Discord)
    const { stream, providerKey } = result;
    const fullText = await stream.text;

    // Save the assistant response (skip for guest users)
    if (!isGuestUser) {
      const db = tenantDb(tenantId);
      await saveAssistantMessage({
        udb,
        db,
        responseMessage: {
          role: "assistant",
          parts: [{ type: "text", text: fullText }],
        },
        conversationId: activeConversationId,
        tenantId,
        userId,
        projectId: projectId ?? null,
      });
    }

    logger.info("Discord chat completed", {
      userId,
      tenantId,
      conversationId: activeConversationId,
      provider: providerKey,
      responseLength: fullText.length,
    });

    const response: DiscordChatResponse = {
      text: fullText,
      conversationId: activeConversationId,
      provider: providerKey,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error("Discord chat internal API error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userId,
      tenantId,
    });

    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
