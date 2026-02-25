"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import {
  buildReplyToAddress,
  buildTrackingHtml,
  buildTrackingTextLine,
  generateTrackingCode,
  slugifyForReplyTo,
} from "@/lib/email-tracking";
import { renderEmailTemplate } from "@/lib/email-templates";
import { prisma, tenantDb } from "@/lib/db";
import {
  getConversationsCore,
  getConversationCore,
  getUnreadCountCore,
  createConversationCore,
  replyToConversationCore,
  markAsReadCore,
  archiveConversationCore,
  type GetConversationsOptions,
  type ConversationListItem,
  type ConversationWithMessages,
  type CreateConversationData,
  type ReplyToConversationData,
} from "@/services/email-conversations";

// ─────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────

const getConversationsOptionsSchema = z.object({
  projectId: z.string().optional(),
  isArchived: z.boolean().optional(),
  outboundOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const createConversationSchema = z.object({
  externalEmail: z.string().email(),
  externalName: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  projectId: z.string().optional(),
});

const replyToConversationSchema = z.object({
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
});

// ─────────────────────────────────────────
// Result types
// ─────────────────────────────────────────

export type GetConversationsResult = {
  conversations: ConversationListItem[];
};

export type GetConversationResult =
  | { success: true; conversation: ConversationWithMessages }
  | { success: false; error: string };

export type CreateConversationResult =
  | { success: true; conversation: ConversationWithMessages }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type ReplyToConversationResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type MarkAsReadResult = { success: true } | { success: false; error: string };
export type ArchiveConversationResult = { success: true } | { success: false; error: string };

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function getConversations(
  options?: z.infer<typeof getConversationsOptionsSchema>
): Promise<GetConversationsResult> {
  const { tenantId, userId } = await requireAuth();

  const parsed = getConversationsOptionsSchema.safeParse(options ?? {});
  const opts: GetConversationsOptions = parsed.success ? parsed.data : {};

  const conversations = await getConversationsCore(tenantId, userId, opts);
  return { conversations };
}

export async function getEmailUnreadCount(): Promise<{ unreadCount: number }> {
  const { tenantId, userId } = await requireAuth();
  const unreadCount = await getUnreadCountCore(tenantId, userId);
  return { unreadCount };
}

export async function getConversation(id: string): Promise<GetConversationResult> {
  const { tenantId, userId } = await requireAuth();

  try {
    const conversation = await getConversationCore(tenantId, userId, id);
    return { success: true, conversation };
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

export async function createConversation(
  data: z.infer<typeof createConversationSchema>
): Promise<CreateConversationResult> {
  const { tenantId, userId, user } = await requireAuth();

  const parsed = createConversationSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { projectId, ...rest } = parsed.data;
  if (projectId) {
    await requireProject(tenantId, projectId, userId);
  }

  const fromEmail = user.email ?? "";
  const fromName = user.name ?? null;
  if (!fromEmail) {
    return { success: false, error: "USER_EMAIL_REQUIRED" };
  }

  try {
    // Generate tracking code and prepare email data BEFORE creating anything in DB
    const trackingCode = generateTrackingCode();

    // Reply-to = userSlug.tenantSlug@domain (emailSlug from membership)
    const [tenant, membership, userWithLocale] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, name: true },
      }),
      prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        select: { emailSlug: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { locale: true },
      }),
    ]);
    const locale = (userWithLocale?.locale === "en" ? "en" : "sv") as "sv" | "en";
    const tenantSlug =
      tenant?.slug ?? slugifyForReplyTo(tenant?.name ?? "tenant");
    const userSlug =
      membership?.emailSlug ?? slugifyForReplyTo(user.name ?? "user");

    if (membership && membership.emailSlug === null) {
      const db = tenantDb(tenantId);
      await db.membership.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: { emailSlug: userSlug },
      });
    }

    const replyToAddr = buildReplyToAddress(tenantSlug, userSlug);
    const tenantName = tenant?.name ?? "ArbetsYtan";

    // Wrap body in branded email template
    const rendered = await renderEmailTemplate({
      tenantId,
      name: "outgoing",
      locale,
      variables: {
        tenantName,
        subject: rest.subject,
        content: rest.bodyHtml + "\n" + buildTrackingHtml(trackingCode),
      },
      fallbackSubject: rest.subject,
      fallbackHtml: rest.bodyHtml,
    });

    const text =
      (rest.bodyText ?? "").trim() + buildTrackingTextLine(trackingCode);

    const displayName = fromName
      ? `${fromName} via ${tenantName}`
      : tenantName;
    const fromAddress = `${displayName} <${replyToAddr}>`;
    const sent = await sendEmail({
      to: rest.externalEmail,
      subject: rest.subject,
      html: rendered.html,
      text,
      from: fromAddress,
      replyTo: replyToAddr,
    });

    if (!sent.success) {
      console.error("[email-conversations] createConversation sendEmail failed", sent.error);
      return { success: false, error: sent.error ?? "SEND_FAILED" };
    }

    // Only create conversation in DB if email was sent successfully
    const conversation = await createConversationCore(
      tenantId,
      userId,
      { ...rest, projectId } as CreateConversationData,
      fromEmail,
      fromName,
      trackingCode
    );

    // Create EmailLog with resendMessageId for In-Reply-To routing; link to first outbound message
    if (sent.messageId) {
      const db = tenantDb(tenantId);
      const emailLog = await db.emailLog.create({
        data: {
          tenantId,
          userId,
          projectId: projectId ?? null,
          direction: "OUTBOUND",
          status: "SENT",
          from: fromAddress,
          to: [rest.externalEmail],
          subject: rest.subject,
          body: rest.bodyText ?? "",
          htmlBody: rendered.html,
          resendMessageId: sent.messageId,
          sentAt: new Date(),
        },
      });
      const firstMessageId = conversation.messages[0]?.id;
      if (firstMessageId) {
        await db.emailMessage.update({
          where: { id: firstMessageId },
          data: { emailLogId: emailLog.id },
        });
      }
      console.log("[email-conversations] createConversation EmailLog created for In-Reply-To routing", {
        resendMessageId: sent.messageId,
        conversationId: conversation.id,
      });
    }

    revalidatePath("/[locale]/email", "page");
    return { success: true, conversation };
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

export async function replyToConversation(
  id: string,
  data: z.infer<typeof replyToConversationSchema>
): Promise<ReplyToConversationResult> {
  const { tenantId, userId, user } = await requireAuth();

  const parsed = replyToConversationSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const fromEmail = user.email ?? "";
  const fromName = user.name ?? null;
  if (!fromEmail) {
    return { success: false, error: "USER_EMAIL_REQUIRED" };
  }

  try {
    const conversation = await getConversationCore(tenantId, userId, id);
    const outboundMessage = await replyToConversationCore(
      tenantId,
      userId,
      id,
      parsed.data as ReplyToConversationData,
      fromEmail,
      fromName
    );

    // Reply-to = userSlug.tenantSlug@domain
    const [tenant, membership, userWithLocale] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, name: true },
      }),
      prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        select: { emailSlug: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { locale: true },
      }),
    ]);
    const locale = (userWithLocale?.locale === "en" ? "en" : "sv") as "sv" | "en";
    const tenantSlug =
      tenant?.slug ?? slugifyForReplyTo(tenant?.name ?? "tenant");
    const userSlug =
      membership?.emailSlug ?? slugifyForReplyTo(user.name ?? "user");

    if (membership && membership.emailSlug === null) {
      const db = tenantDb(tenantId);
      await db.membership.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: { emailSlug: userSlug },
      });
    }

    const replyToAddr = buildReplyToAddress(tenantSlug, userSlug);
    const tenantName = tenant?.name ?? "ArbetsYtan";

    // Wrap body in branded email template
    const rendered = await renderEmailTemplate({
      tenantId,
      name: "outgoing",
      locale,
      variables: {
        tenantName,
        subject: conversation.subject,
        content: parsed.data.bodyHtml + "\n" + buildTrackingHtml(conversation.trackingCode),
      },
      fallbackSubject: conversation.subject,
      fallbackHtml: parsed.data.bodyHtml,
    });

    const text =
      (parsed.data.bodyText ?? "").trim() +
      buildTrackingTextLine(conversation.trackingCode);

    const displayName = fromName
      ? `${fromName} via ${tenantName}`
      : tenantName;
    const fromAddress = `${displayName} <${replyToAddr}>`;
    const sent = await sendEmail({
      to: conversation.externalEmail,
      subject: conversation.subject,
      html: rendered.html,
      text,
      from: fromAddress,
      replyTo: replyToAddr,
    });

    if (!sent.success) {
      console.error("[email-conversations] replyToConversation sendEmail failed", sent.error);
      return { success: false, error: sent.error ?? "SEND_FAILED" };
    }

    // Create EmailLog with resendMessageId for In-Reply-To routing; link to outbound message
    if (sent.messageId) {
      const db = tenantDb(tenantId);
      const emailLog = await db.emailLog.create({
        data: {
          tenantId,
          userId,
          projectId: conversation.projectId,
          direction: "OUTBOUND",
          status: "SENT",
          from: fromAddress,
          to: [conversation.externalEmail],
          subject: conversation.subject,
          body: parsed.data.bodyText ?? "",
          htmlBody: rendered.html,
          resendMessageId: sent.messageId,
          sentAt: new Date(),
        },
      });
      await db.emailMessage.update({
        where: { id: outboundMessage.id },
        data: { emailLogId: emailLog.id },
      });
      console.log("[email-conversations] replyToConversation EmailLog created for In-Reply-To routing", {
        resendMessageId: sent.messageId,
        conversationId: id,
      });
    }

    revalidatePath("/[locale]/email", "page");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

export async function markConversationAsRead(id: string): Promise<MarkAsReadResult> {
  const { tenantId, userId } = await requireAuth();

  try {
    await markAsReadCore(tenantId, userId, id);
    revalidatePath("/[locale]/email", "page");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

export async function archiveConversation(id: string): Promise<ArchiveConversationResult> {
  const { tenantId, userId } = await requireAuth();

  try {
    await archiveConversationCore(tenantId, userId, id);
    revalidatePath("/[locale]/email", "page");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}
