"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { tenantDb, userDb, prisma } from "@/lib/db";
import { sendEmail, type EmailAttachment as ResendAttachment } from "@/lib/email";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logOutboundEmail } from "@/lib/email-log";
import { queueEmailEmbeddingProcessing } from "@/lib/ai/email-embeddings";

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
}): string {
  const { tenantName, logoUrl, subject, body, locale = "sv" } = options;

  // Convert plain text body to HTML paragraphs
  const htmlBody = body
    .split("\n\n")
    .map((p) => `<p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  const footerText =
    locale === "sv"
      ? `Detta mail skickades via ${tenantName} på ArbetsYtan.`
      : `This email was sent via ${tenantName} on ArbetsYtan.`;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${tenantName}" style="max-height: 40px; margin-bottom: 16px;" />`
    : "";

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
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
                ${tenantName}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px;">
              <h2 style="margin: 0 0 24px; color: #111827; font-size: 20px; font-weight: 600;">
                ${subject}
              </h2>
              ${htmlBody}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; border-radius: 0 0 16px 16px; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">
                ${footerText}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} ${tenantName}
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

  // Get tenant branding
  const brand = await getTenantBrandTemplate(tenantId);
  const html = buildBrandedEmail({
    tenantName: brand.tenantName,
    logoUrl: brand.logoUrl,
    subject,
    body,
  });

  // Get sender info
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  // Send emails
  const errors: string[] = [];
  let lastMessageId: string | undefined;

  // Determine from address (always use RESEND_FROM for verified domain)
  // Fallback to Resend onboarding domain if not configured
  const fromAddress = process.env.RESEND_FROM?.trim() || "ArbetsYtan <onboarding@resend.dev>";

  for (const recipient of result.data.recipients) {
    const emailResult = await sendEmail({
      to: recipient,
      subject: `[${brand.tenantName}] ${subject}`,
      html,
      replyTo: replyTo ?? sender?.email,
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
          projectId: undefined, // external emails don't have project
          from: fromAddress,
          to: [recipient],
          subject: `[${brand.tenantName}] ${subject}`,
          body: body,
          htmlBody: html,
          resendMessageId: emailResult.messageId,
          attachments: fileAttachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType || "application/octet-stream",
            size: a.content.length,
            // Note: We don't have bucket/key for attachments from the resend format
            // This is a limitation - we would need to refetch from file table
            bucket: "",
            key: "",
          })),
        });

        // Queue embedding processing
        queueEmailEmbeddingProcessing(emailLogId, tenantId);
      } catch (logError) {
        // Log error but don't fail the email send
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

  // Get tenant branding and sender
  const [brand, sender] = await Promise.all([
    getTenantBrandTemplate(tenantId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);

  const locale = (membership.user.locale === "en" ? "en" : "sv") as "sv" | "en";
  const html = buildBrandedEmail({
    tenantName: brand.tenantName,
    logoUrl: brand.logoUrl,
    subject,
    body,
    locale,
  });

  // Always use RESEND_FROM for verified domain, sender email as reply-to
  // Fallback to Resend onboarding domain if not configured
  const fromAddress = process.env.RESEND_FROM?.trim() || "ArbetsYtan <onboarding@resend.dev>";

  const emailResult = await sendEmail({
    to: membership.user.email,
    subject: `[${brand.tenantName}] ${subject}`,
    html,
    from: fromAddress,
    replyTo: sender?.email,
  });

  if (!emailResult.success) {
    return { success: false, error: emailResult.error };
  }

  // Log email to database
  try {
    const emailLogId = await logOutboundEmail({
      tenantId,
      userId,
      projectId: undefined, // team member emails don't have project context
      from: fromAddress,
      to: [membership.user.email],
      subject: `[${brand.tenantName}] ${subject}`,
      body: body,
      htmlBody: html,
      resendMessageId: emailResult.messageId,
    });

    // Queue embedding processing
    queueEmailEmbeddingProcessing(emailLogId, tenantId);
  } catch (logError) {
    // Log error but don't fail the email send
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

  // Get tenant branding and sender
  const [brand, sender] = await Promise.all([
    getTenantBrandTemplate(tenantId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);

  const errors: string[] = [];
  // Always use RESEND_FROM for verified domain, sender email as reply-to
  // Fallback to Resend onboarding domain if not configured
  const fromAddress = process.env.RESEND_FROM?.trim() || "ArbetsYtan <onboarding@resend.dev>";

  for (const membership of memberships) {
    const locale = (membership.user.locale === "en" ? "en" : "sv") as "sv" | "en";
    const html = buildBrandedEmail({
      tenantName: brand.tenantName,
      logoUrl: brand.logoUrl,
      subject,
      body,
      locale,
    });

    const emailResult = await sendEmail({
      to: membership.user.email,
      subject: `[${brand.tenantName}] ${subject}`,
      html,
      from: fromAddress,
      replyTo: sender?.email,
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
          projectId: undefined, // team member emails don't have project context
          from: fromAddress,
          to: [membership.user.email],
          subject: `[${brand.tenantName}] ${subject}`,
          body: body,
          htmlBody: html,
          resendMessageId: emailResult.messageId,
          attachments: fileAttachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType || "application/octet-stream",
            size: a.content.length,
            // Note: We don't have bucket/key for attachments from the resend format
            // This is a limitation - we would need to refetch from file table
            bucket: "",
            key: "",
          })),
        });

        // Queue embedding processing
        queueEmailEmbeddingProcessing(emailLogId, tenantId);
      } catch (logError) {
        // Log error but don't fail the email send
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
