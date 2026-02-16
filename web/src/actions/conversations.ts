"use server";

import { requireAuth, requireProject } from "@/lib/auth";
import {
  getAiConversationCore,
  getAiConversationMessagesCore,
  listAiConversationsCore,
  type MessageCoreResult,
} from "@/services/conversation-service";
import { userDb } from "@/lib/db";

export type ConversationListItem = {
  id: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
};

export type ConversationWithMessagesResult =
  | {
      success: true;
      conversation: { id: string; title: string | null; summary: string | null };
      messages: MessageCoreResult[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | { success: false; error: string };

/**
 * List project AI conversations for the current user.
 * Access is validated via requireProject.
 */
export async function getProjectConversations(
  projectId: string
): Promise<{ success: true; conversations: ConversationListItem[] } | { success: false; error: string }> {
  const { tenantId, userId } = await requireAuth();
  try {
    await requireProject(tenantId, projectId, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    return { success: false, error: message };
  }

  const conversations = await listAiConversationsCore({ tenantId, userId }, projectId);

  return {
    success: true,
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messageCount ?? 0,
    })),
  };
}

/**
 * List personal AI conversations for the current user.
 */
export async function getPersonalConversations(): Promise<
  { success: true; conversations: ConversationListItem[] } | { success: false; error: string }
> {
  const { tenantId, userId } = await requireAuth();

  const conversations = await listAiConversationsCore({ tenantId, userId });

  return {
    success: true,
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messageCount ?? 0,
    })),
  };
}

/**
 * Hämta antal olästa AI-meddelanden (PROJECT_TO_PERSONAL) för inloggad användare.
 */
export async function getUnreadAiMessageCount(): Promise<number> {
  const { userId } = await requireAuth();
  const udb = userDb(userId, {});
  return udb.aIMessage.count({
    where: { direction: "PROJECT_TO_PERSONAL", read: false },
  });
}

/**
 * Get a single conversation with paginated messages.
 * If projectId is provided, verifies the conversation belongs to that project.
 */
export async function getConversationWithMessages(
  conversationId: string,
  projectId?: string,
  cursor?: string,
  limit: number = 20
): Promise<ConversationWithMessagesResult> {
  const { tenantId, userId } = await requireAuth();

  if (projectId) {
    try {
      await requireProject(tenantId, projectId, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forbidden";
      return { success: false, error: message };
    }
  }

  const ctx = { tenantId, userId };
  const [conversation, messagesResult] = await Promise.all([
    getAiConversationCore(ctx, conversationId, projectId),
    getAiConversationMessagesCore(ctx, conversationId, { cursor, limit }),
  ]);

  if (!conversation) {
    return { success: false, error: "Conversation not found" };
  }

  return {
    success: true,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      summary: conversation.summary,
    },
    messages: messagesResult.messages,
    nextCursor: messagesResult.nextCursor,
    hasMore: messagesResult.hasMore,
  };
}
