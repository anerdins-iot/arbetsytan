/**
 * Utility for extracting readable body text from email messages.
 * Handles the case where bodyText from Resend webhooks contains only "—"
 * (email client separator) or other non-meaningful content.
 */

const EMPTY_BODY_PATTERNS = /^[\s\u2014\u2013\-—–_=]+$/;

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isEmptyOrSeparator(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  return EMPTY_BODY_PATTERNS.test(trimmed);
}

/**
 * Extract readable text from an email message.
 * Priority: bodyText → bodyHtml (stripped) → fallback string.
 * Handles cases where bodyText is only "—" or similar separators.
 */
export function getReadableBody(
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined,
  fallback?: string
): string {
  if (!isEmptyOrSeparator(bodyText)) {
    return bodyText!.trim();
  }

  if (bodyHtml) {
    const stripped = stripHtmlTags(bodyHtml);
    if (!isEmptyOrSeparator(stripped)) {
      return stripped;
    }
  }

  return fallback ?? "";
}

/**
 * Get a preview string for conversation list cards.
 * Returns a truncated version of the readable body.
 */
export function getPreviewText(
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined,
  maxLength = 100
): string {
  const body = getReadableBody(bodyText, bodyHtml);
  if (!body) return "";
  const singleLine = body.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxLength
    ? singleLine
    : singleLine.slice(0, maxLength) + "\u2026";
}
