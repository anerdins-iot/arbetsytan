/**
 * Email helper using Resend.
 * Used for password reset, invitations, etc.
 */

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Default from address. Set RESEND_FROM or use Resend onboarding domain. */
const DEFAULT_FROM =
  process.env.RESEND_FROM ?? "ArbetsYtan <onboarding@resend.dev>";

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
