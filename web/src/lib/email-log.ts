/**
 * Email logging service - logs all outbound and inbound emails to database
 */

import { tenantDb, prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type LogOutboundEmailInput = {
  tenantId: string;
  userId: string;
  projectId?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  resendMessageId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    bucket: string;
    key: string;
  }>;
};

/**
 * Log an outbound email to the database.
 * Returns the emailLogId.
 */
export async function logOutboundEmail(input: LogOutboundEmailInput): Promise<string> {
  const db = tenantDb(input.tenantId);

  try {
    const emailLog = await db.emailLog.create({
      data: {
        direction: "OUTBOUND",
        status: input.resendMessageId ? "SENT" : "QUEUED",
        from: input.from,
        to: input.to,
        cc: input.cc ?? undefined,
        bcc: input.bcc ?? undefined,
        subject: input.subject,
        body: input.body,
        htmlBody: input.htmlBody ?? undefined,
        resendMessageId: input.resendMessageId ?? undefined,
        sentAt: input.resendMessageId ? new Date() : undefined,
        tenantId: input.tenantId,
        userId: input.userId,
        projectId: input.projectId ?? undefined,
        attachments: input.attachments
          ? {
              create: input.attachments.map((a) => ({
                filename: a.filename,
                contentType: a.contentType,
                size: a.size,
                bucket: a.bucket,
                key: a.key,
              })),
            }
          : undefined,
      },
    });

    logger.info("logOutboundEmail: created", {
      emailLogId: emailLog.id,
      to: input.to,
      subject: input.subject,
    });

    return emailLog.id;
  } catch (error) {
    logger.error("logOutboundEmail: failed", {
      error: error instanceof Error ? error.message : String(error),
      to: input.to,
      subject: input.subject,
    });
    throw error;
  }
}

/**
 * Update email status (for webhook events from Resend).
 */
export async function updateEmailStatus(
  resendMessageId: string,
  status: "DELIVERED" | "BOUNCED" | "FAILED",
  error?: string
): Promise<void> {
  try {
    const timestampField =
      status === "DELIVERED"
        ? "deliveredAt"
        : status === "BOUNCED"
          ? "bouncedAt"
          : "failedAt";

    await prisma.emailLog.update({
      where: { resendMessageId },
      data: {
        status,
        [timestampField]: new Date(),
        resendError: error ?? undefined,
      },
    });

    logger.info("updateEmailStatus: updated", {
      resendMessageId,
      status,
    });
  } catch (err) {
    logger.error("updateEmailStatus: failed", {
      resendMessageId,
      status,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Get emails for a user (with optional project and direction filter).
 */
export async function getEmailsForUser(
  tenantId: string,
  userId: string,
  options?: {
    projectId?: string;
    limit?: number;
    offset?: number;
    direction?: "INBOUND" | "OUTBOUND";
  }
): Promise<
  Array<{
    id: string;
    direction: string;
    status: string;
    from: string;
    to: unknown;
    subject: string;
    bodyPreview: string;
    createdAt: Date;
    sentAt: Date | null;
    resendMessageId: string | null;
    projectId: string | null;
    _count: { attachments: number };
  }>
> {
  const db = tenantDb(tenantId);
  const { projectId, limit = 50, offset = 0, direction } = options ?? {};

  const emails = await db.emailLog.findMany({
    where: {
      userId,
      ...(projectId ? { projectId } : {}),
      ...(direction ? { direction } : {}),
    },
    select: {
      id: true,
      direction: true,
      status: true,
      from: true,
      to: true,
      subject: true,
      body: true,
      createdAt: true,
      sentAt: true,
      resendMessageId: true,
      projectId: true,
      _count: {
        select: { attachments: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return emails.map((e) => ({
    ...e,
    bodyPreview: e.body.length > 200 ? e.body.slice(0, 200) + "..." : e.body,
  }));
}

/**
 * Get email detail by ID (including attachments).
 */
export async function getEmailDetail(
  tenantId: string,
  emailLogId: string
): Promise<{
  id: string;
  direction: string;
  status: string;
  from: string;
  to: unknown;
  cc: unknown;
  bcc: unknown;
  subject: string;
  body: string;
  htmlBody: string | null;
  resendMessageId: string | null;
  resendError: string | null;
  userId: string;
  projectId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  failedAt: Date | null;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    bucket: string;
    key: string;
  }>;
} | null> {
  const db = tenantDb(tenantId);

  const email = await db.emailLog.findFirst({
    where: { id: emailLogId },
    include: {
      attachments: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          size: true,
          bucket: true,
          key: true,
        },
      },
    },
  });

  return email;
}
