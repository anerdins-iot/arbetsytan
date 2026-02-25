/**
 * POST /api/ai/chat — AI chat streaming endpoint.
 * Personal AI only. Frontend sends projectId in request body when a project is selected.
 * RAG uses request projectId when present. All conversations are PERSONAL.
 * Uses Vercel AI SDK for streaming via SSE.
 *
 * Core AI logic (system prompt, tools, streaming) is in shared-core.ts
 * so it can be reused by other consumers (e.g. Discord bot).
 */
import type { UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { getSession, requireProject } from "@/lib/auth";
import { userDb } from "@/lib/db";
import type { ProviderKey } from "@/lib/ai/providers";
import {
  type RagSource,
  executeAIChat,
  extractTextFromParts,
  saveUserMessage,
  saveAssistantMessage,
} from "@/lib/ai/shared-core";
import { tenantDb } from "@/lib/db";
import {
  type MessageEmbeddingsDb,
  queueMessageEmbeddingProcessing,
} from "@/lib/ai/message-embeddings";
import { logger } from "@/lib/logger";

export type { RagSource };

type ChatRequestBody = {
  messages: UIMessage[];
  conversationId?: string;
  projectId?: string;
  provider?: ProviderKey;
  imageFileIds?: string[];
};

export async function POST(req: NextRequest) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, tenantId, role } = session;
  const userId = user.id;
  const udb = userDb(userId, {});

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, conversationId, projectId, provider, imageFileIds } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array is required" },
      { status: 400 }
    );
  }

  // Validate project access when projectId is provided
  if (projectId) {
    try {
      await requireProject(tenantId, projectId, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forbidden";
      const status = message === "PROJECT_NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: message }, { status });
    }
  }

  // Get or create conversation
  let activeConversationId = conversationId;
  let conversationSummary: string | null = null;

  if (!activeConversationId) {
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    const title = lastUserMsg
      ? extractTextFromParts(lastUserMsg).slice(0, 100)
      : "Ny konversation";

    const conversation = await udb.conversation.create({
      data: {
        type: "PERSONAL",
        title,
        provider: provider ?? "CLAUDE_HAIKU",
        userId,
        projectId: null,
      },
    });
    activeConversationId = conversation.id;
  } else {
    // Verify conversation belongs to this user and get summary for context
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

  // Save the latest user message to DB (personal AI: use userDb for auto-emit)
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === "user") {
    await saveUserMessage({
      udb,
      message: lastUserMessage,
      conversationId: activeConversationId,
      tenantId,
      userId,
      projectId: projectId ?? null,
    });
  }

  // Execute AI chat via shared core
  let result;
  try {
    result = await executeAIChat({
      context: {
        tenantId,
        userId,
        userName: user.name ?? undefined,
        userRole: role,
        projectId: projectId ?? null,
        conversationId: activeConversationId,
        conversationType: "PERSONAL",
      },
      messages,
      provider: provider as ProviderKey | undefined,
      imageFileIds,
      conversationSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI provider error";
    const status = message.includes("not configured") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const { stream, providerKey, ragSources, searchResults } = result;

  logger.info("AI chat request", {
    userId,
    tenantId,
    provider: providerKey,
    conversationId: activeConversationId,
    projectId: projectId ?? null,
    messageCount: messages.length,
    ragChunks: ragSources.length,
  });

  // Headers: conversation ID, model key and optional RAG sources for client
  const responseHeaders: Record<string, string> = {
    "X-Conversation-Id": activeConversationId,
    "X-Model-Key": providerKey,
  };
  if (ragSources.length > 0) {
    // Base64 encode to avoid ByteString errors with Unicode characters in excerpts
    responseHeaders["X-Sources"] = Buffer.from(JSON.stringify(ragSources), "utf-8").toString("base64");
  }

  // Debug context: send unified search results to frontend for RAG debug modal
  if (searchResults.length > 0) {
    const recentUserMsgsForDebug = [...messages].filter(m => m.role === "user").slice(-3);
    const debugQueryText = recentUserMsgsForDebug.map(extractTextFromParts).join(" ");
    const knowledge = searchResults.filter(r => r.source === "knowledge").slice(0, 10);
    const conversations = searchResults.filter(r => r.source === "conversation").slice(0, 10);
    const documents = searchResults.filter(r => r.source === "document").slice(0, 10);
    const debugContext = {
      knowledge: knowledge.map(r => ({ text: r.text, similarity: r.similarity })),
      conversations: conversations.map(r => ({ text: r.text, similarity: r.similarity })),
      documents: documents.map(r => ({ text: r.text, similarity: r.similarity, metadata: r.metadata })),
      totalResults: searchResults.length,
      queryText: debugQueryText,
    };
    responseHeaders["X-Debug-Context"] = Buffer.from(JSON.stringify(debugContext), "utf-8").toString("base64");
  }

  const db = tenantDb(tenantId);

  return stream.toUIMessageStreamResponse({
    headers: responseHeaders,
    onFinish: async ({ responseMessage }: { responseMessage: { id?: string; role: string; parts?: unknown[]; content?: unknown[] } }) => {
      if (!activeConversationId || responseMessage.role !== "assistant") return;
      try {
        await saveAssistantMessage({
          udb,
          db,
          responseMessage: responseMessage as { id?: string; role: string; parts?: unknown[]; content?: unknown[] },
          conversationId: activeConversationId,
          tenantId,
          userId,
          projectId: projectId ?? null,
        });
      } catch (err) {
        logger.error("Failed to save assistant message from stream onFinish", {
          conversationId: activeConversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });
  } catch (err) {
    logger.error("AI chat route error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
