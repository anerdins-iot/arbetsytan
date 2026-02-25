"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { tenantDb, userDb, prisma } from "@/lib/db";
import { sendEmail, DEFAULT_FROM_EMAIL, type EmailAttachment as ResendAttachment } from "@/lib/email";
import { markdownToHtml, markdownToPlainText } from "@/lib/email-body";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logOutboundEmail } from "@/lib/email-log";
import { queueEmailEmbeddingProcessing } from "@/lib/ai/email-embeddings";
import { renderEmailTemplate } from "@/lib/email-templates";
import { createOutboundConversationCore } from "@/services/email-conversations";
import {
  buildReplyToAddress,
  buildTrackingHtml,
  buildTrackingTextLine,
  generateTrackingCode,
  slugifyForReplyTo,
} from "@/lib/email-tracking";

// ─── S3/MinIO Client ────────────────────────────────────

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION!,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

// ─── Types ─────────────────────────────────────────────

export type SendEmailActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  messageId?: string;
};

export type EmailAttachmentInput = {
  fileId: string;
  fileName: string;
  source: "personal" | "project";
  projectId?: string;
};

// ─── Attachment Helper ─────────────────────────────────

async function fetchFileAttachments(
  attachments: EmailAttachmentInput[],
  tenantId: string,
  userId: string
): Promise<ResendAttachment[]> {
  if (!attachments || attachments.length === 0) return [];

  const db = tenantDb(tenantId);
  const s3 = getS3Client();
  const result: ResendAttachment[] = [];

  for (const attachment of attachments) {
    try {
      // Verify user has access to file (personal via userDb, project via tenantDb)
      let file = null;
      if (attachment.source === "personal") {
        file = await userDb(userId, {}).file.findFirst({
          where: { id: attachment.fileId },
          select: { id: true, name: true, type: true, bucket: true, key: true },
        });
      } else {
        file = await db.file.findFirst({
          where: {
            id: attachment.fileId,
            ...(attachment.projectId ? { projectId: attachment.projectId } : {}),
          },
          select: { id: true, name: true, type: true, bucket: true, key: true },
        });
      }

      if (!file) {
        console.warn(`File ${attachment.fileId} not found or access denied`);
        continue;
      }

      // Fetch file content from S3/MinIO
      const command = new GetObjectCommand({
        Bucket: file.bucket,
        Key: file.key,
      });
      const response = await s3.send(command);

      if (!response.Body) {
        console.warn(`Empty body for file ${file.id}`);
        continue;
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();
      let done = false;
      while (!done) {
        const { value, done: isDone } = await reader.read();
        if (value) chunks.push(value);
        done = isDone;
      }
      const buffer = Buffer.concat(chunks);

      result.push({
        filename: file.name,
        content: buffer,
        contentType: file.type,
      });
    } catch (err) {
      console.error(`Failed to fetch attachment ${attachment.fileId}:`, err);
    }
  }

  return result;
}

// ─── Sender Identity Helper ───────────────────────────

type SenderIdentity = {
  /** Personal from: "Fredrik Anerdin via Anerdins El <fredrik.anerdins-el-xxxx@domain>" */
  from: string;
  /** Reply-to address: same as from email for personal mail */
  replyTo: string;
  /** Tenant display name for subject prefix */
  tenantName: string;
};

/**
 * Build a personal sender identity for outbound mail.
 * From = "{senderName} via {tenantName} <userSlug.tenantSlug@receivingDomain>"
 * Reply-To = same address (so replies route through our inbound pipeline).
 * This replaces the generic noreply@ as from-address for personal mail.
 */
async function getSenderIdentity(
  tenantId: string,
  userId: string,
  senderName: string | null
): Promise<SenderIdentity> {
  const [tenant, membership] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, name: true },
    }),
    prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { emailSlug: true },
    }),
  ]);
  const tenantSlug = tenant?.slug ?? slugifyForReplyTo(tenant?.name ?? "tenant");
  const tenantName = tenant?.name ?? "ArbetsYtan";
  const userSlug = membership?.emailSlug ?? slugifyForReplyTo(senderName ?? "user");

  // Backfill emailSlug if missing
  if (membership && membership.emailSlug === null) {
    const db = tenantDb(tenantId);
    await db.membership.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { emailSlug: userSlug },
    });
  }

  const replyTo = buildReplyToAddress(tenantSlug, userSlug);
  const displayName = senderName
    ? `${senderName} via ${tenantName}`
    : tenantName;
  const from = `${displayName} <${DEFAULT_FROM_EMAIL}>`;

  return { from, replyTo, tenantName };
}

// ─── Schemas ───────────────────────────────────────────

const sendEmailSchema = z.object({
  recipients: z.array(z.string().email()).min(1, "Minst en mottagare krävs"),
  subject: z.string().min(1, "Ämnesrad krävs").max(300),
  body: z.string().min(1, "Meddelandeinnehåll krävs").max(50000),
  replyTo: z.string().email().optional(),
});

const sendToTeamMemberSchema = z.object({
  memberId: z.string().min(1),
  subject: z.string().min(1, "Ämnesrad krävs").max(300),
  body: z.string().min(1, "Meddelandeinnehåll krävs").max(50000),
});

// ─── Brand Template ────────────────────────────────────

async function getTenantBrandTemplate(tenantId: string): Promise<{
  tenantName: string;
  logoUrl: string | null;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  // Note: logoUrl is not in current schema, could be added later
  return {
    tenantName: tenant?.name ?? "ArbetsYtan",
    logoUrl: null,
  };
}

function buildBrandedEmail(options: {
  tenantName: string;
  logoUrl: string | null;
  subject: string;
  body: string;
  locale?: "sv" | "en";
}): { html: string; text: string } {
  const { tenantName, logoUrl, subject, body, locale = "sv" } = options;

  const htmlBody = markdownToHtml(body);
  const plainBody = markdownToPlainText(body);

  const footerText =
    locale === "sv"
      ? `Detta mail skickades via ${tenantName} på ArbetsYtan. Du kan anpassa systemmallar under Inställningar → E-postmallar.`
      : `This email was sent via ${tenantName} on ArbetsYtan. You can customize system templates under Settings → Email templates.`;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${tenantName}" style="max-height: 40px; margin-bottom: 16px;" />`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttr(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); border-radius: 16px 16px 0 0; padding: 32px 40px; text-align: center;">
              ${logoHtml}
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                ${escapeHtmlAttr(tenantName)}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px;">
              <h2 style="margin: 0 0 24px; color: #111827; font-size: 20px; font-weight: 600;">
                ${escapeHtmlAttr(subject)}
              </h2>
              ${htmlBody}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; border-radius: 0 0 16px 16px; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">
                ${escapeHtmlAttr(footerText)}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} ${escapeHtmlAttr(tenantName)}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = [
    subject,
    "",
    plainBody,
    "",
    "---",
    footerText,
    `© ${new Date().getFullYear()} ${tenantName}`,
  ].join("\n");

  return { html, text };
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Send to External Email ────────────────────────────

export async function sendExternalEmail(
  formData: FormData,
  attachments?: EmailAttachmentInput[]
): Promise<SendEmailActionResult> {
  const { tenantId, userId } = await requirePermission("canSendEmails");

  // Parse recipients from comma-separated string or array
  const recipientsRaw = formData.get("recipients");
  let recipients: string[] = [];

  if (typeof recipientsRaw === "string") {
    recipients = recipientsRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
  }

  const replyToRaw = formData.get("replyTo");
  const raw = {
    recipients,
    subject: formData.get("subject"),
    body: formData.get("body"),
    // Convert empty string to undefined so Zod doesn't validate it as invalid email
    replyTo: typeof replyToRaw === "string" && replyToRaw.trim() ? replyToRaw.trim() : undefined,
  };

  const result = sendEmailSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { subject, body, replyTo } = result.data;

  // Fetch file attachments from S3/MinIO
  const fileAttachments = await fetchFileAttachments(attachments ?? [], tenantId, userId);

  // Get tenant branding and format body for email (markdown → html + plain text)
  const brand = await getTenantBrandTemplate(tenantId);

  // Use the "outgoing" template (editable in Settings → Email templates)
  let html: string;
  let text: string;
  try {
    const htmlBody = markdownToHtml(body);
    const rendered = await renderEmailTemplate({
      tenantId,
      name: "outgoing",
      locale: "sv",
      variables: {
        tenantName: brand.tenantName,
        subject,
        content: htmlBody,
        year: new Date().getFullYear().toString(),
      },
    });
    if (rendered.html) {
      html = rendered.html;
      text = markdownToPlainText(body);
    } else {
      const branded = buildBrandedEmail({ tenantName: brand.tenantName, logoUrl: brand.logoUrl, subject, body });
      html = branded.html;
      text = branded.text;
    }
  } catch {
    // Fallback to legacy branded email if template rendering fails
    const branded = buildBrandedEmail({ tenantName: brand.tenantName, logoUrl: brand.logoUrl, subject, body });
    html = branded.html;
    text = branded.text;
  }

  // Get sender info and identity
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const identity = await getSenderIdentity(tenantId, userId, sender?.name ?? null);

  // Send emails (multipart: html + text)
  const errors: string[] = [];
  let lastMessageId: string | undefined;

  for (const recipient of result.data.recipients) {
    // Generate a tracking code per recipient so replies thread to the right conversation
    const trackingCode = generateTrackingCode();
    const trackedHtml = html + "\n" + buildTrackingHtml(trackingCode);
    const trackedText = (text ?? "").trim() + buildTrackingTextLine(trackingCode);

    const emailResult = await sendEmail({
      to: recipient,
      subject: `[${identity.tenantName}] ${subject}`,
      html: trackedHtml,
      text: trackedText,
      from: identity.from,
      replyTo: replyTo ?? identity.replyTo,
      attachments: fileAttachments,
    });

    if (!emailResult.success) {
      errors.push(`${recipient}: ${emailResult.error}`);
    } else {
      lastMessageId = emailResult.messageId;

      // Log email to database
      try {
        const emailLogId = await logOutboundEmail({
          tenantId,
          userId,
          projectId: undefined,
          from: identity.from,
          to: [recipient],
          subject: `[${identity.tenantName}] ${subject}`,
          body: body,
          htmlBody: trackedHtml,
          resendMessageId: emailResult.messageId,
          attachments: fileAttachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType || "application/octet-stream",
            size: a.content.length,
            bucket: "",
            key: "",
          })),
        });

        // Queue embedding processing
        queueEmailEmbeddingProcessing(emailLogId, tenantId);

        // Record in EmailConversation + EmailMessage so it appears in Skickat
        try {
          const sentSubject = `[${identity.tenantName}] ${subject}`;
          await createOutboundConversationCore(tenantId, userId, {
            externalEmail: recipient,
            subject: sentSubject,
            bodyHtml: markdownToHtml(body),
            bodyText: markdownToPlainText(body),
            fromEmail: sender?.email ?? identity.replyTo,
            fromName: sender?.name ?? null,
            emailLogId,
            trackingCode,
          });
        } catch (convError) {
          console.error("Failed to create conversation for sent email:", convError);
        }
      } catch (logError) {
        console.error("Failed to log email:", logError);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Kunde inte skicka till: ${errors.join(", ")}`,
    };
  }

  return { success: true, messageId: lastMessageId };
}

// ─── Send to Team Members ──────────────────────────────

export async function sendToTeamMember(
  formData: FormData
): Promise<SendEmailActionResult> {
  const { tenantId, userId } = await requirePermission("canSendEmails");

  const raw = {
    memberId: formData.get("memberId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  };

  const result = sendToTeamMemberSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { memberId, subject, body } = result.data;
  const db = tenantDb(tenantId);

  // Verify member belongs to this tenant
  const membership = await db.membership.findFirst({
    where: { userId: memberId },
    include: { user: { select: { email: true, name: true, locale: true } } },
  });

  if (!membership) {
    return { success: false, error: "Användaren hittades inte i organisationen" };
  }

  // Get tenant branding and sender identity
  const [brand, sender] = await Promise.all([
    getTenantBrandTemplate(tenantId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);
  const identity = await getSenderIdentity(tenantId, userId, sender?.name ?? null);

  const locale = (membership.user.locale === "en" ? "en" : "sv") as "sv" | "en";
  const { html, text } = buildBrandedEmail({
    tenantName: identity.tenantName,
    logoUrl: brand.logoUrl,
    subject,
    body,
    locale,
  });

  const emailResult = await sendEmail({
    to: membership.user.email,
    subject: `[${identity.tenantName}] ${subject}`,
    html,
    text,
    from: identity.from,
    replyTo: identity.replyTo,
  });

  if (!emailResult.success) {
    return { success: false, error: emailResult.error };
  }

  // Log email to database
  try {
    const emailLogId = await logOutboundEmail({
      tenantId,
      userId,
      projectId: undefined,
      from: identity.from,
      to: [membership.user.email],
      subject: `[${identity.tenantName}] ${subject}`,
      body: body,
      htmlBody: html,
      resendMessageId: emailResult.messageId,
    });

    // Queue embedding processing
    queueEmailEmbeddingProcessing(emailLogId, tenantId);
  } catch (logError) {
    console.error("Failed to log email:", logError);
  }

  return { success: true, messageId: emailResult.messageId };
}

// ─── Send to Multiple Team Members ─────────────────────

export async function sendToTeamMembers(
  memberIds: string[],
  subject: string,
  body: string,
  attachments?: EmailAttachmentInput[]
): Promise<SendEmailActionResult> {
  const { tenantId, userId } = await requirePermission("canSendEmails");
  const db = tenantDb(tenantId);

  // Get all members
  const memberships = await db.membership.findMany({
    where: { userId: { in: memberIds } },
    include: { user: { select: { email: true, name: true, locale: true } } },
  });

  if (memberships.length === 0) {
    return { success: false, error: "Inga användare hittades" };
  }

  // Fetch file attachments from S3/MinIO (once for all recipients)
  const fileAttachments = await fetchFileAttachments(attachments ?? [], tenantId, userId);

  // Get tenant branding and sender identity
  const [brand, sender] = await Promise.all([
    getTenantBrandTemplate(tenantId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);
  const identity = await getSenderIdentity(tenantId, userId, sender?.name ?? null);

  const errors: string[] = [];

  for (const membership of memberships) {
    const locale = (membership.user.locale === "en" ? "en" : "sv") as "sv" | "en";
    const { html, text } = buildBrandedEmail({
      tenantName: identity.tenantName,
      logoUrl: brand.logoUrl,
      subject,
      body,
      locale,
    });

    // Generate tracking code per recipient so replies thread correctly
    const trackingCode = generateTrackingCode();
    const trackedHtml = html + "\n" + buildTrackingHtml(trackingCode);
    const trackedText = (text ?? "").trim() + buildTrackingTextLine(trackingCode);

    const emailResult = await sendEmail({
      to: membership.user.email,
      subject: `[${identity.tenantName}] ${subject}`,
      html: trackedHtml,
      text: trackedText,
      from: identity.from,
      replyTo: identity.replyTo,
      attachments: fileAttachments,
    });

    if (!emailResult.success) {
      errors.push(`${membership.user.email}: ${emailResult.error}`);
    } else {
      // Log email to database
      try {
        const emailLogId = await logOutboundEmail({
          tenantId,
          userId,
          projectId: undefined,
          from: identity.from,
          to: [membership.user.email],
          subject: `[${identity.tenantName}] ${subject}`,
          body: body,
          htmlBody: trackedHtml,
          resendMessageId: emailResult.messageId,
          attachments: fileAttachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType || "application/octet-stream",
            size: a.content.length,
            bucket: "",
            key: "",
          })),
        });

        // Queue embedding processing
        queueEmailEmbeddingProcessing(emailLogId, tenantId);

        // Record in EmailConversation + EmailMessage so it appears in Skickat
        try {
          const sentSubject = `[${identity.tenantName}] ${subject}`;
          await createOutboundConversationCore(tenantId, userId, {
            externalEmail: membership.user.email,
            externalName: membership.user.name ?? null,
            subject: sentSubject,
            bodyHtml: markdownToHtml(body),
            bodyText: markdownToPlainText(body),
            fromEmail: sender?.email ?? identity.replyTo,
            fromName: sender?.name ?? null,
            emailLogId,
            trackingCode,
          });
        } catch (convError) {
          console.error("Failed to create conversation for sent email:", convError);
        }
      } catch (logError) {
        console.error("Failed to log email:", logError);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Kunde inte skicka till: ${errors.join(", ")}`,
    };
  }

  return { success: true };
}

// ─── Get Team Members for Selection ────────────────────

export async function getTeamMembersForEmail(): Promise<
  Array<{ id: string; name: string; email: string; role: string }>
> {
  const { tenantId } = await requirePermission("canSendEmails");
  const db = tenantDb(tenantId);

  const memberships = await db.membership.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
    role: m.role as string,
  }));
}

// ─── Get Projects with Members for Email ────────────────

export type ProjectWithMembers = {
  id: string;
  name: string;
  members: Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: string;
  }>;
};

export async function getProjectsWithMembersForEmail(): Promise<ProjectWithMembers[]> {
  const { tenantId, userId } = await requirePermission("canSendEmails");
  const db = tenantDb(tenantId);

  // First get user's membership to check project access
  const userMembership = await db.membership.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!userMembership) {
    return [];
  }

  // Get projects where user is a member (via projectMembers)
  const projects = await db.project.findMany({
    where: {
      projectMembers: {
        some: { membershipId: userMembership.id },
      },
      status: { not: "ARCHIVED" },
    },
    select: {
      id: true,
      name: true,
      projectMembers: {
        include: {
          membership: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    members: project.projectMembers.map((pm) => ({
      membershipId: pm.membershipId,
      userId: pm.membership.user.id,
      name: pm.membership.user.name ?? pm.membership.user.email,
      email: pm.membership.user.email,
      role: pm.membership.role as string,
    })),
  }));
}
