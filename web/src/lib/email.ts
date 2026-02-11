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

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  from?: string;
};

/**
 * Sends an email via Resend.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    return {
      success: false,
      error: "RESEND_API_KEY is not configured",
    };
  }

  try {
    const { error } = await resend.emails.send({
      from: options.from ?? DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      return {
        success: false,
        error: error.message ?? "Failed to send email",
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
