/**
 * Inbound email processing (Resend webhook).
 * Parses tracking code, finds conversation, creates EmailLog + EmailMessage, queues embedding.
 * Emits Socket.IO email:new, creates in-app Notification, and optionally sends email notification.
 */

import { prisma, tenantDb, userDb } from "@/lib/db";
import { parseTrackingCode } from "@/lib/email-tracking";
import { logger } from "@/lib/logger";
import { queueEmailEmbeddingProcessing } from "@/lib/ai/email-embeddings";
import { getSocketServer } from "@/lib/socket";
import { userRoom } from "@/lib/socket-events";
import { renderEmailTemplate, getAppBaseUrl } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";

export type ResendEmailReceivedPayload = {
  type: "email.received";
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message_id?: string;
    attachments?: Array<{
      id: string;
      filename: string;
      content_type: string;
      content_disposition?: string;
      content_id?: string;
    }>;
    html?: string;
    text?: string;
  };
};

/** Parse "Name <email@domain>" or "email@domain" into { email, name }. */
function parseFromAddress(from: string): { email: string; name: string | null } {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { email: match[2].trim(), name: match[1].trim() || null };
  }
  return { email: from.trim(), name: null };
}

/** Strip HTML tags for plain-text body. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Process an inbound email (email.received event).
 * 1. Parse trackingCode from to-address or HTML body.
 * 2. If found: find conversation, create INBOUND EmailMessage, update lastMessageAt and unreadCount.
 * 3. If not found: log as unknown (no conversation created).
 */
export async function processInboundEmail(
  payload: ResendEmailReceivedPayload
): Promise<void> {
  const data = payload.data;
  const toAddress = Array.isArray(data.to) ? data.to[0] : String(data.to ?? "");
  const htmlBody = data.html ?? null;
  const trackingCode = parseTrackingCode(toAddress, htmlBody);

  logger.info("processInboundEmail: received", {
    email_id: data.email_id,
    from: data.from,
    to: data.to,
    subject: data.subject,
    trackingCode: trackingCode ?? null,
  });

  if (!trackingCode) {
    logger.info("processInboundEmail: no tracking code, skipping conversation", {
      email_id: data.email_id,
    });
    return;
  }

  const conversation = await prisma.emailConversation.findUnique({
    where: { trackingCode },
  });

  if (!conversation) {
    logger.info("processInboundEmail: conversation not found for tracking code", {
      trackingCode,
      email_id: data.email_id,
    });
    return;
  }

  const { email: fromEmail, name: fromName } = parseFromAddress(data.from);
  const toEmail = toAddress;
  const receivedAt = new Date(data.created_at ?? Date.now());
  const bodyText = data.text ?? (data.html ? stripHtml(data.html) : "");
  const db = tenantDb(conversation.tenantId);

  // Create EmailLog so the inbound email is searchable via embeddings
  const emailLog = await db.emailLog.create({
    data: {
      tenantId: conversation.tenantId,
      userId: conversation.userId,
      projectId: conversation.projectId,
      direction: "INBOUND",
      status: "DELIVERED",
      from: fromEmail,
      to: [toEmail],
      subject: data.subject,
      body: bodyText || "(no body)",
      htmlBody: data.html ?? null,
    },
  });

  const message = await db.emailMessage.create({
    data: {
      conversationId: conversation.id,
      emailLogId: emailLog.id,
      direction: "INBOUND",
      fromEmail,
      fromName: fromName ?? undefined,
      toEmail,
      subject: data.subject,
      bodyHtml: data.html ?? null,
      bodyText: data.text ?? null,
      isRead: false,
      sentAt: null,
      receivedAt,
    },
  });

  const updated = await db.emailConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: receivedAt,
      unreadCount: { increment: 1 },
    },
  });

  queueEmailEmbeddingProcessing(emailLog.id, conversation.tenantId);

  const senderDisplayName = fromName ?? fromEmail;
  const preview =
    (bodyText ?? "").slice(0, 200).replace(/\s+/g, " ").trim() +
    ((bodyText ?? "").length > 200 ? "…" : "");

  // Realtime: emit to user so inbox can refresh
  try {
    const io = getSocketServer();
    io.to(userRoom(conversation.userId)).emit("email:new", {
      conversationId: conversation.id,
      messageId: message.id,
    });
  } catch (err) {
    logger.warn("processInboundEmail: socket emit failed", { err });
  }

  // In-app notification
  try {
    const notificationDb = userDb(conversation.userId, {});
    await notificationDb.notification.create({
      data: {
        title: `Nytt e-postmeddelande från ${senderDisplayName}`,
        body: data.subject ? `Ämne: ${data.subject}` : "Nytt svar i en konversation.",
        channel: "IN_APP",
        eventType: "EMAIL_RECEIVED",
        read: false,
        sent: true,
        user: { connect: { id: conversation.userId } },
      },
    });
  } catch (err) {
    logger.warn("processInboundEmail: create notification failed", { err });
  }

  // Email notification to user (if they have an email and we have a template)
  try {
    const user = await prisma.user.findUnique({
      where: { id: conversation.userId },
      select: { email: true, locale: true },
    });
    if (user?.email) {
      const locale = user.locale === "en" ? "en" : "sv";
      const conversationUrl = `${getAppBaseUrl()}/${locale}/email?conversationId=${conversation.id}`;
      const { subject, html } = await renderEmailTemplate({
        name: "email-reply-notification",
        locale,
        variables: {
          senderName: senderDisplayName,
          subject: data.subject,
          preview: preview || "(Ingen text)",
          conversationUrl,
        },
      });
      const fromAddress =
        process.env.RESEND_FROM ?? "ArbetsYtan <noreply@lowly.se>";
      await sendEmail({
        from: fromAddress,
        to: user.email,
        subject,
        html,
      });
    }
  } catch (err) {
    logger.warn("processInboundEmail: send notification email failed", { err });
  }

  logger.info("processInboundEmail: created INBOUND message", {
    conversationId: conversation.id,
    messageId: message.id,
    emailLogId: emailLog.id,
    unreadCount: updated.unreadCount,
  });
}
