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

/** The raw email address without display name, for building custom From headers. */
export const DEFAULT_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL?.trim() ??
  (() => {
    const legacy = process.env.RESEND_FROM?.trim().replace(/^["']|["']$/g, "").trim();
    const match = legacy?.match(/<([^>]+)>/);
    if (match) return match[1];
    if (legacy?.includes("@")) return legacy;
    return "onboarding@resend.dev";
  })();

export type EmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  /** Plain text version for multipart/alternative. Recommended so text-only clients get a clean version. */
  text?: string;
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
      text: options.text ?? undefined,
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

/**
 * Fetches the body (html + text) and headers of a received email by id.
 * Resend webhooks do NOT include body; you must call this after receiving email.received.
 * Headers (e.g. in-reply-to, message-id) are used for Message-ID–based reply routing.
 * @see https://resend.com/docs/dashboard/receiving/get-email-content
 */
export async function getReceivedEmailContent(
  emailId: string
): Promise<{
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
}> {
  if (!resend) return { html: null, text: null, headers: null };
  try {
    const { data, error } = await (resend as any).emails.receiving.get(emailId);
    if (error || !data) {
      console.warn("[EMAIL] getReceivedEmailContent failed", { emailId, error });
      return { html: null, text: null, headers: null };
    }
    // Log raw API response for debugging routing (headers, in_reply_to, message_id, etc.)
    console.log(
      "[EMAIL] getReceivedEmailContent raw data:",
      JSON.stringify(
        {
          ...data,
          html: data.html != null ? "(present)" : null,
          text: data.text != null ? "(present)" : null,
        },
        null,
        2
      )
    );
    const html = typeof data.html === "string" ? data.html : null;
    const text = typeof data.text === "string" ? data.text : null;
    // Normalise headers to Record<string, string>; Resend may expose as object or array
    let headers: Record<string, string> | null = null;
    if (data.headers != null && typeof data.headers === "object") {
      headers = {};
      for (const [k, v] of Object.entries(data.headers)) {
        if (typeof k === "string" && (typeof v === "string" || (Array.isArray(v) && v.length > 0))) {
          headers[k] = typeof v === "string" ? v : String(v[0]);
        }
      }
    }
    // Resend may also return top-level in_reply_to / message_id
    if (headers == null) headers = {};
    if (typeof data.in_reply_to === "string" && !headers["in-reply-to"])
      headers["in-reply-to"] = data.in_reply_to;
    if (typeof data.message_id === "string" && !headers["message-id"])
      headers["message-id"] = data.message_id;
    const headersOut = Object.keys(headers).length > 0 ? headers : null;
    return { html, text, headers: headersOut };
  } catch (err) {
    console.error("[EMAIL] getReceivedEmailContent exception", { emailId, err });
    return { html: null, text: null, headers: null };
  }
}
