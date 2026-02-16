/**
 * Email tracking for reply-to addressing and parsing inbound replies.
 * Used to match incoming emails to EmailConversation via tracking code.
 */

import { randomBytes } from "node:crypto";

const RECEIVING_DOMAIN =
  process.env.RESEND_RECEIVING_DOMAIN ?? "mail.lowly.se";

const TRACKING_COMMENT_PREFIX = "<!-- lowly-tracking:";
const TRACKING_COMMENT_SUFFIX = " -->";

/** Regex to extract tenant+tracking from address like inbox+TENANT_TRACKING@domain */
const REPLY_TO_CODE_REGEX = /^inbox\+([^@]+)@/i;

/** Regex to extract tenant-only from address like inbox+TENANT@domain (no underscore) */
const REPLY_TO_TENANT_REGEX = /^inbox\+([^_@]+)@/i;

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
 * Builds the reply-to address for a conversation with tenant isolation.
 * Returns format Resend accepts: "Name <inbox+tenant_tracking@domain>".
 * Resend requires 'email@example.com' or 'Name <email@example.com>' format.
 */
export function buildReplyToAddress(tenantCode: string, trackingCode: string): string {
  const domain = (RECEIVING_DOMAIN || "mail.lowly.se").trim().replace(/^https?:\/\//, "").split("/")[0];
  const safeTenant = String(tenantCode).replace(/[^a-zA-Z0-9_-]/g, "");
  const safeTracking = String(trackingCode).replace(/[^a-zA-Z0-9_-]/g, "");
  const email = `inbox+${safeTenant}_${safeTracking}@${domain}`;
  return `ArbetsYtan <${email}>`;
}

/**
 * Returns the invisible HTML comment for backup tracking.
 * Format: <!-- lowly-tracking:{trackingCode} -->
 */
export function buildTrackingHtml(trackingCode: string): string {
  return `${TRACKING_COMMENT_PREFIX}${trackingCode}${TRACKING_COMMENT_SUFFIX}`;
}

/**
 * Extracts tenant code and tracking code from incoming email.
 * 1. Tries to match inbox+{tenantCode}_{trackingCode}@ in toAddress.
 * 2. If no underscore, tries inbox+{tenantCode}@ (tenant-only).
 * 3. If not found, searches for lowly-tracking:{code} in htmlBody (legacy).
 * Returns { tenantCode, trackingCode } or null if not found.
 */
export function parseTrackingCode(
  toAddress: string,
  htmlBody: string | null | undefined
): { tenantCode: string; trackingCode: string | null } | null {
  if (toAddress) {
    const match = toAddress.match(REPLY_TO_CODE_REGEX);
    if (match?.[1]) {
      const fullCode = match[1];
      // Check if it contains underscore (tenant_tracking format)
      if (fullCode.includes('_')) {
        const [tenantCode, trackingCode] = fullCode.split('_', 2);
        return { tenantCode, trackingCode };
      } else {
        // Tenant-only format (no tracking code)
        return { tenantCode: fullCode, trackingCode: null };
      }
    }
  }
  // Legacy: search in HTML body for tracking code only (no tenant)
  if (htmlBody) {
    const match = htmlBody.match(HTML_TRACKING_REGEX);
    if (match?.[1]) {
      // Legacy format without tenant code - return null to indicate no tenant found
      return null;
    }
  }
  return null;
}
