/**
 * Email conversation service — core logic for inbox conversations.
 * All queries filter on tenantId AND userId (conversations are per-user).
 */

import { tenantDb } from "@/lib/db";
import { generateTrackingCode } from "@/lib/email-tracking";
import type { PaginationOptions } from "./types";
import type { EmailDirection } from "../../generated/prisma/client";

export type GetConversationsOptions = PaginationOptions & {
  projectId?: string;
  isArchived?: boolean;
  /** When true, only return conversations where the latest message is outbound (user sent last). */
  outboundOnly?: boolean;
};

export type ConversationListItem = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string | null;
  projectName: string | null;
  externalEmail: string;
  externalName: string | null;
  trackingCode: string;
  subject: string;
  lastMessageAt: Date;
  unreadCount: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  latestMessage: {
    id: string;
    direction: EmailDirection;
    subject: string;
    bodyText: string | null;
    bodyHtml: string | null;
    createdAt: Date;
  } | null;
};

export type EmailMessageData = {
  id: string;
  conversationId: string;
  direction: EmailDirection;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  sentAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
};

export type ConversationWithMessages = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string | null;
  projectName: string | null;
  externalEmail: string;
  externalName: string | null;
  trackingCode: string;
  subject: string;
  lastMessageAt: Date;
  unreadCount: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages: EmailMessageData[];
};

export type CreateConversationData = {
  externalEmail: string;
  externalName?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  projectId?: string;
};

export type ReplyToConversationData = {
  bodyHtml: string;
  bodyText?: string;
};

/**
 * List conversations for the user. Always filtered by tenantId and userId.
 * Sorted by lastMessageAt DESC. Includes latest message for preview.
 */
export async function getConversationsCore(
  tenantId: string,
  userId: string,
  options?: GetConversationsOptions
): Promise<ConversationListItem[]> {
  const db = tenantDb(tenantId);

  const where: { userId: string; projectId?: string; isArchived?: boolean } = {
    userId,
  };
  if (options?.projectId != null) where.projectId = options.projectId;
  if (options?.isArchived != null) where.isArchived = options.isArchived;

  const conversations = await db.emailConversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
    include: {
      project: {
        select: { id: true, name: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          direction: true,
          subject: true,
          bodyText: true,
          bodyHtml: true,
          createdAt: true,
        },
      },
    },
  });

  let result = conversations.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    userId: c.userId,
    projectId: c.projectId,
    projectName: c.project?.name ?? null,
    externalEmail: c.externalEmail,
    externalName: c.externalName,
    trackingCode: c.trackingCode,
    subject: c.subject,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    isArchived: c.isArchived,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    latestMessage: c.messages[0]
      ? {
          id: c.messages[0].id,
          direction: c.messages[0].direction as EmailDirection,
          subject: c.messages[0].subject,
          bodyText: c.messages[0].bodyText,
          bodyHtml: c.messages[0].bodyHtml,
          createdAt: c.messages[0].createdAt,
        }
      : null,
  }));

  if (options?.outboundOnly) {
    result = result.filter((c) => c.latestMessage?.direction === "OUTBOUND");
  }

  return result;
}

/**
 * Get a single conversation with all messages. Throws if not found or not owned by user.
 */
export async function getConversationCore(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<ConversationWithMessages> {
  const db = tenantDb(tenantId);

  const conv = await db.emailConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
    include: {
      project: {
        select: { id: true, name: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          conversationId: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          toEmail: true,
          subject: true,
          bodyText: true,
          bodyHtml: true,
          isRead: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conv) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  return {
    id: conv.id,
    tenantId: conv.tenantId,
    userId: conv.userId,
    projectId: conv.projectId,
    projectName: conv.project?.name ?? null,
    externalEmail: conv.externalEmail,
    externalName: conv.externalName,
    trackingCode: conv.trackingCode,
    subject: conv.subject,
    lastMessageAt: conv.lastMessageAt,
    unreadCount: conv.unreadCount,
    isArchived: conv.isArchived,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction as EmailDirection,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmail: m.toEmail,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      isRead: m.isRead,
      sentAt: m.sentAt,
      receivedAt: m.receivedAt,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Create a new conversation and the first (outbound) message.
 * Returns the created conversation.
 */
export async function createConversationCore(
  tenantId: string,
  userId: string,
  data: CreateConversationData,
  fromEmail: string,
  fromName: string | null,
  trackingCode?: string
): Promise<ConversationWithMessages> {
  const db = tenantDb(tenantId);
  const code = trackingCode ?? generateTrackingCode();
  const now = new Date();

  const conv = await db.emailConversation.create({
    data: {
      tenantId,
      userId,
      projectId: data.projectId ?? null,
      externalEmail: data.externalEmail,
      externalName: data.externalName ?? null,
      trackingCode: code,
      subject: data.subject,
      lastMessageAt: now,
      unreadCount: 0,
      isArchived: false,
      messages: {
        create: {
          direction: "OUTBOUND",
          fromEmail,
          fromName,
          toEmail: data.externalEmail,
          subject: data.subject,
          bodyHtml: data.bodyHtml ?? null,
          bodyText: data.bodyText ?? null,
          isRead: true,
          sentAt: now,
          receivedAt: null,
        },
      },
    },
    include: {
      project: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          conversationId: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          toEmail: true,
          subject: true,
          bodyText: true,
          bodyHtml: true,
          isRead: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  });

  return {
    id: conv.id,
    tenantId: conv.tenantId,
    userId: conv.userId,
    projectId: conv.projectId,
    projectName: conv.project?.name ?? null,
    externalEmail: conv.externalEmail,
    externalName: conv.externalName,
    trackingCode: conv.trackingCode,
    subject: conv.subject,
    lastMessageAt: conv.lastMessageAt,
    unreadCount: conv.unreadCount,
    isArchived: conv.isArchived,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction as EmailDirection,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmail: m.toEmail,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      isRead: m.isRead,
      sentAt: m.sentAt,
      receivedAt: m.receivedAt,
      createdAt: m.createdAt,
    })),
  };
}

export type CreateOutboundConversationData = {
  externalEmail: string;
  externalName?: string | null;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  projectId?: string | null;
  fromEmail: string;
  fromName?: string | null;
  /** When set, links the created EmailMessage to this EmailLog (e.g. when sending from AI). */
  emailLogId?: string | null;
};

/**
 * Create a new conversation with a single OUTBOUND message.
 * Used when sending email from AI (sendExternalEmail / sendToTeamMembers) so the mail appears in Skickat.
 */
export async function createOutboundConversationCore(
  tenantId: string,
  userId: string,
  data: CreateOutboundConversationData
): Promise<void> {
  const db = tenantDb(tenantId);
  const code = generateTrackingCode();
  const now = new Date();

  await db.emailConversation.create({
    data: {
      tenantId,
      userId,
      projectId: data.projectId ?? null,
      externalEmail: data.externalEmail,
      externalName: data.externalName ?? null,
      trackingCode: code,
      subject: data.subject,
      lastMessageAt: now,
      unreadCount: 0,
      isArchived: false,
      messages: {
        create: {
          direction: "OUTBOUND",
          fromEmail: data.fromEmail,
          fromName: data.fromName ?? null,
          toEmail: data.externalEmail,
          subject: data.subject,
          bodyHtml: data.bodyHtml ?? null,
          bodyText: data.bodyText ?? null,
          isRead: true,
          sentAt: now,
          receivedAt: null,
          emailLogId: data.emailLogId ?? undefined,
        },
      },
    },
  });
}

/**
 * Reply to a conversation (create outbound message, update lastMessageAt).
 * Throws if conversation not found or not owned by user.
 */
export async function replyToConversationCore(
  tenantId: string,
  userId: string,
  conversationId: string,
  data: ReplyToConversationData,
  fromEmail: string,
  fromName: string | null
): Promise<EmailMessageData> {
  const db = tenantDb(tenantId);

  const conv = await db.emailConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
  });
  if (!conv) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const now = new Date();
  const message = await db.emailMessage.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      fromEmail,
      fromName,
      toEmail: conv.externalEmail,
      subject: conv.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText ?? null,
      isRead: true,
      sentAt: now,
      receivedAt: null,
    },
  });

  await db.emailConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });

  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction as EmailDirection,
    fromEmail: message.fromEmail,
    fromName: message.fromName,
    toEmail: message.toEmail,
    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    isRead: message.isRead,
    sentAt: message.sentAt,
    receivedAt: message.receivedAt,
    createdAt: message.createdAt,
  };
}

/**
 * Total unread count across user's non-archived inbox conversations.
 */
export async function getUnreadCountCore(
  tenantId: string,
  userId: string
): Promise<number> {
  const db = tenantDb(tenantId);
  const result = await db.emailConversation.aggregate({
    where: { userId, isArchived: false },
    _sum: { unreadCount: true },
  });
  return result._sum.unreadCount ?? 0;
}

/**
 * Mark conversation as read: unreadCount = 0, all INBOUND messages isRead = true.
 */
export async function markAsReadCore(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<void> {
  const db = tenantDb(tenantId);

  const conv = await db.emailConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
  });
  if (!conv) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  await db.$transaction([
    db.emailConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    }),
    db.emailMessage.updateMany({
      where: { conversationId, direction: "INBOUND" },
      data: { isRead: true },
    }),
  ]);
}

/**
 * Archive a conversation (isArchived = true).
 */
export async function archiveConversationCore(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<void> {
  const db = tenantDb(tenantId);

  const conv = await db.emailConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
  });
  if (!conv) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  await db.emailConversation.update({
    where: { id: conversationId },
    data: { isArchived: true },
  });
}
