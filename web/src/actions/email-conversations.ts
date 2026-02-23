"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { buildReplyToAddress, buildTrackingHtml, generateTrackingCode } from "@/lib/email-tracking";
import { prisma } from "@/lib/db";
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

    // Get tenant inboxCode for reply-to address
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { inboxCode: true },
    });
    const inboxCode = tenant?.inboxCode ?? tenantId;

    const html = rest.bodyHtml + "\n" + buildTrackingHtml(trackingCode);

    // Always use RESEND_FROM for verified domain
    // Fallback to Resend onboarding domain if not configured
    const fromAddress = process.env.RESEND_FROM?.trim() || "ArbetsYtan <onboarding@resend.dev>";

    // Send email FIRST - before creating anything in the database
    const sent = await sendEmail({
      to: rest.externalEmail,
      subject: rest.subject,
      html,
      from: fromAddress,
      replyTo: buildReplyToAddress(inboxCode, trackingCode),
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
    await replyToConversationCore(
      tenantId,
      userId,
      id,
      parsed.data as ReplyToConversationData,
      fromEmail,
      fromName
    );

    // Get tenant inboxCode for reply-to address
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { inboxCode: true },
    });
    const inboxCode = tenant?.inboxCode ?? tenantId;

    const html = parsed.data.bodyHtml + "\n" + buildTrackingHtml(conversation.trackingCode);

    // Always use RESEND_FROM for verified domain
    // Fallback to Resend onboarding domain if not configured
    const fromAddress = process.env.RESEND_FROM?.trim() || "ArbetsYtan <onboarding@resend.dev>";

    const sent = await sendEmail({
      to: conversation.externalEmail,
      subject: conversation.subject,
      html,
      from: fromAddress,
      replyTo: buildReplyToAddress(inboxCode, conversation.trackingCode),
    });

    if (!sent.success) {
      console.error("[email-conversations] replyToConversation sendEmail failed", sent.error);
      return { success: false, error: sent.error ?? "SEND_FAILED" };
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
