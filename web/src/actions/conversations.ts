"use server";

import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb, userDb } from "@/lib/db";
import { RECENT_MESSAGES_AFTER_SUMMARY } from "@/lib/ai/conversation-config";

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
      messages: { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date }[];
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

  const db = tenantDb(tenantId);
  const conversations = await db.conversation.findMany({
    where: {
      projectId,
      userId,
      type: "PROJECT",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return {
    success: true,
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    })),
  };
}

/**
 * List personal AI conversations for the current user.
 */
export async function getPersonalConversations(): Promise<
  { success: true; conversations: ConversationListItem[] } | { success: false; error: string }
> {
  const { userId } = await requireAuth();

  const udb = userDb(userId);
  const conversations = await udb.conversation.findMany({
    where: { type: "PERSONAL" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return {
    success: true,
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    })),
  };
}

/**
 * Hämta antal olästa AI-meddelanden (PROJECT_TO_PERSONAL) för inloggad användare.
 */
export async function getUnreadAiMessageCount(): Promise<number> {
  const { userId } = await requireAuth();
  const udb = userDb(userId);
  return udb.aIMessage.count({
    where: { direction: "PROJECT_TO_PERSONAL", read: false },
  });
}

/**
 * Get a single conversation with all messages (for loading into chat).
 * If projectId is provided, verifies the conversation belongs to that project.
 */
export async function getConversationWithMessages(
  conversationId: string,
  projectId?: string
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

  const db = tenantDb(tenantId);
  const udb = userDb(userId);
  const conversation = await (projectId != null
    ? db.conversation.findFirst({
        where: { id: conversationId, userId, projectId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      })
    : udb.conversation.findFirst({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      }));

  if (!conversation) {
    return { success: false, error: "Conversation not found" };
  }

  let messages = conversation.messages;
  if (
    conversation.summary &&
    messages.length > RECENT_MESSAGES_AFTER_SUMMARY
  ) {
    messages = messages.slice(-RECENT_MESSAGES_AFTER_SUMMARY);
  }

  return {
    success: true,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      summary: conversation.summary,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  };
}
