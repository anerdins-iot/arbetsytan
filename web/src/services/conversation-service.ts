import { tenantDb, userDb } from "@/lib/db";
import type { ServiceContext } from "./types";
import { RECENT_MESSAGES_AFTER_SUMMARY } from "@/lib/ai/conversation-config";

export type ConversationCoreResult = {
  id: string;
  title: string | null;
  summary: string | null;
  updatedAt: Date;
  messageCount?: number;
};

export type MessageCoreResult = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
};

export type GetConversationMessagesOptions = {
  limit?: number;
  cursor?: string;
};

/**
 * Get a single AI conversation.
 */
export async function getAiConversationCore(
  ctx: ServiceContext,
  conversationId: string,
  projectId?: string
): Promise<ConversationCoreResult | null> {
  const db = projectId ? tenantDb(ctx.tenantId) : userDb(ctx.userId, {});
  
  const conversation = await db.conversation.findFirst({
    where: projectId 
      ? { id: conversationId, userId: ctx.userId, projectId }
      : { id: conversationId },
    select: {
      id: true,
      title: true,
      summary: true,
      updatedAt: true,
    },
  });

  return conversation as ConversationCoreResult | null;
}

/**
 * Get messages for an AI conversation with cursor-based pagination.
 * Returns messages in ascending order (chronological).
 */
export async function getAiConversationMessagesCore(
  ctx: ServiceContext,
  conversationId: string,
  options: GetConversationMessagesOptions = {}
): Promise<{ messages: MessageCoreResult[]; nextCursor: string | null; hasMore: boolean }> {
  const { limit = 20, cursor } = options;
  
  // We use tenantDb for all message queries because it handles the OR logic for personal/project conversations
  const db = tenantDb(ctx.tenantId);

  // Fetch limit + 1 in descending order to check if there are more older messages
  const messages = await db.message.findMany({
    where: { conversationId },
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  const hasMore = messages.length > limit;
  const resultMessages = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? resultMessages[resultMessages.length - 1].id : null;

  // Reverse back to ascending order for the UI
  return {
    messages: resultMessages.reverse().map((m) => ({
      id: m.id,
      role: m.role as "USER" | "ASSISTANT",
      content: m.content,
      createdAt: m.createdAt,
    })),
    nextCursor,
    hasMore,
  };
}

/**
 * List AI conversations for the user.
 */
export async function listAiConversationsCore(
  ctx: ServiceContext,
  projectId?: string
): Promise<ConversationCoreResult[]> {
  const db = projectId ? tenantDb(ctx.tenantId) : userDb(ctx.userId, {});
  
  const conversations = await db.conversation.findMany({
    where: projectId 
      ? { projectId, userId: ctx.userId, type: "PROJECT" }
      : { type: "PERSONAL" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    updatedAt: c.updatedAt,
    messageCount: c._count.messages,
  }));
}
