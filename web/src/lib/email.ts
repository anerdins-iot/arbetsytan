/**
 * Email helper using Resend.
 * Used for password reset, invitations, etc.
 */

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Default from address.
 * Preferred: set RESEND_FROM_NAME and RESEND_FROM_EMAIL separately in Coolify
 * to avoid issues with spaces and angle brackets in a single env var.
 * Fallback: RESEND_FROM as full "Name <email>" string (legacy).
 */
function buildFromAddress(): string {
  const name = process.env.RESEND_FROM_NAME?.trim();
  const email = process.env.RESEND_FROM_EMAIL?.trim();

  // Preferred: two separate vars
  if (name && email) return `${name} <${email}>`;
  if (email) return `ArbetsYtan <${email}>`;

  // Legacy: single RESEND_FROM var (may have Coolify escaping issues)
  const legacy = process.env.RESEND_FROM?.trim().replace(/^["']|["']$/g, "").trim();
  if (legacy?.includes("<") && legacy.includes(">")) {
    // Normalise: strip whitespace inside angle brackets e.g. "Name <email >" → "Name <email>"
    return legacy.replace(/\s*>\s*$/, ">").replace(/<\s*/g, "<").trim();
  }
  if (legacy?.includes("@")) return `ArbetsYtan <${legacy}>`;

  // Final fallback
  return "ArbetsYtan <onboarding@resend.dev>";
}
export const DEFAULT_FROM = buildFromAddress();

export type EmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

/**
 * Sends an email via Resend.
 * Returns { success: true, messageId } or { success: false, error }.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const fromAddress = options.from ?? DEFAULT_FROM;

  console.log("[EMAIL] Attempting to send email:", {
    to: options.to,
    subject: options.subject,
    from: fromAddress,
    replyTo: options.replyTo,
    hasAttachments: !!options.attachments?.length,
    resendConfigured: !!resend,
  });

  if (!resend) {
    console.error("[EMAIL] RESEND_API_KEY is not configured");
    return {
      success: false,
      error: "RESEND_API_KEY is not configured",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
      })),
    });

    if (error) {
      console.error("[EMAIL] Resend API error:", error);
      return {
        success: false,
        error: error.message ?? "Failed to send email",
      };
    }

    console.log("[EMAIL] Email sent successfully:", {
      messageId: data?.id,
      to: options.to,
    });
    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[EMAIL] Exception while sending:", err);
    return {
      success: false,
      error: message,
    };
  }
}
