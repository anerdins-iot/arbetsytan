/**
 * Email tracking for reply-to addressing and parsing inbound replies.
 * Used to match incoming emails to EmailConversation via tracking code.
 */

import { randomBytes } from "node:crypto";

const RECEIVING_DOMAIN =
  process.env.RESEND_RECEIVING_DOMAIN ?? "mail.lowly.se";

const TRACKING_COMMENT_PREFIX = "<!-- lowly-tracking:";
const TRACKING_COMMENT_SUFFIX = " -->";

/** Regex to extract code from address like inbox+CODE@domain */
const REPLY_TO_CODE_REGEX = /^inbox\+([^@]+)@/i;

/** Regex to extract code from HTML comment lowly-tracking:CODE (code is hex) */
const HTML_TRACKING_REGEX = /<!--\s*lowly-tracking:([a-f0-9]+)\s*-->/i;

/**
 * Generates a unique tracking code (URL-safe, alphanumeric).
 * Used as the plus-part in inbox+{code}@domain.
 */
export function generateTrackingCode(): string {
  return randomBytes(14).toString("hex");
}

/**
 * Builds the reply-to address for a conversation.
 * Returns inbox+{trackingCode}@{RESEND_RECEIVING_DOMAIN}.
 */
export function buildReplyToAddress(trackingCode: string): string {
  return `inbox+${trackingCode}@${RECEIVING_DOMAIN}`;
}

/**
 * Returns the invisible HTML comment for backup tracking.
 * Format: <!-- lowly-tracking:{trackingCode} -->
 */
export function buildTrackingHtml(trackingCode: string): string {
  return `${TRACKING_COMMENT_PREFIX}${trackingCode}${TRACKING_COMMENT_SUFFIX}`;
}

/**
 * Extracts tracking code from incoming email.
 * 1. Tries to match inbox+{code}@ in toAddress.
 * 2. If not found, searches for lowly-tracking:{code} in htmlBody.
 * Returns the code or null if not found.
 */
export function parseTrackingCode(
  toAddress: string,
  htmlBody: string | null | undefined
): string | null {
  if (toAddress) {
    const match = toAddress.match(REPLY_TO_CODE_REGEX);
    if (match?.[1]) return match[1];
  }
  if (htmlBody) {
    const match = htmlBody.match(HTML_TRACKING_REGEX);
    if (match?.[1]) return match[1];
  }
  return null;
}
