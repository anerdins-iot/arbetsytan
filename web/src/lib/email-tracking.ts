/**
 * Email tracking for reply-to addressing and parsing inbound replies.
 * Address format: {userSlug}.{tenantSlug}@domain (e.g. fredrik.ane.anerdins-iot@…).
 * Conversation id is hidden in the email body. Legacy inbox+… format still parsed.
 */

import { randomBytes } from "node:crypto";

const RECEIVING_DOMAIN =
  process.env.RESEND_RECEIVING_DOMAIN ?? "mail.lowly.se";

const TRACKING_COMMENT_PREFIX = "<!-- lowly-tracking:";
const TRACKING_COMMENT_SUFFIX = " -->";

/** Regex to extract code from HTML comment or plain text lowly-tracking:CODE (code is hex) */
const HTML_TRACKING_REGEX = /<!--\s*lowly-tracking:([a-f0-9]+)\s*-->/i;
const TEXT_TRACKING_REGEX = /lowly-tracking:([a-f0-9]+)/i;

/** Legacy: address part that looks like a tracking code (8–28 hex chars) */
const LEGACY_TRACKING_PATTERN = /^[a-f0-9]{8,28}$/i;

/**
 * Slugify for reply-to: lowercase, replace spaces/special with one hyphen, trim.
 */
export function slugifyForReplyTo(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "x";
}

/**
 * Compute a unique email slug from user display name for use in reply-to.
 * Uses first name; if that slug is taken in the tenant, adds "." + up to 3 letters of last name.
 * Set at user/membership create. Pass existing slugs (e.g. from other members in same tenant).
 */
export function computeEmailSlugForUser(
  userName: string,
  existingSlugsInTenant: string[]
): string {
  const set = new Set(existingSlugsInTenant.map((s) => s.toLowerCase()));
  const parts = (userName ?? "").trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const firstSlug = slugifyForReplyTo(firstName) || "user";
  const lastSlug = slugifyForReplyTo(lastName);

  if (!set.has(firstSlug)) return firstSlug;
  const suffix3 = lastSlug.slice(0, 3);
  if (suffix3) {
    const withSuffix = `${firstSlug}.${suffix3}`;
    if (!set.has(withSuffix)) return withSuffix;
  }
  if (lastSlug) {
    const withLast = `${firstSlug}.${lastSlug}`;
    if (!set.has(withLast)) return withLast;
  }
  return `${firstSlug}-${randomBytes(2).toString("hex")}`;
}

/**
 * Generates a unique tracking code (hex). Stored in DB and hidden in email body only.
 */
export function generateTrackingCode(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Builds the reply-to address: {userSlug}.{tenantSlug}@domain (e.g. fredrik.ane.anerdins-iot@…).
 * No "inbox" prefix; conversation id is in body only.
 */
export function buildReplyToAddress(tenantSlug: string, userSlug: string): string {
  const safeTenant = tenantSlug.replace(/[^a-z0-9-]/g, "") || "tenant";
  const safeUser = userSlug.replace(/[^a-z0-9.-]/g, "") || "user";
  return `${safeUser}.${safeTenant}@${RECEIVING_DOMAIN}`;
}

/**
 * Returns the invisible HTML comment for backup tracking.
 * Format: <!-- lowly-tracking:{trackingCode} -->
 */
export function buildTrackingHtml(trackingCode: string): string {
  return `${TRACKING_COMMENT_PREFIX}${trackingCode}${TRACKING_COMMENT_SUFFIX}`;
}

/**
 * Returns a plain-text line for tracking so text-only replies can be matched.
 * Append to body text when sending. Format: "\n\nlowly-tracking:{trackingCode}"
 */
export function buildTrackingTextLine(trackingCode: string): string {
  return `\n\nlowly-tracking:${trackingCode}`;
}

export type ParsedTracking = {
  tenantCode: string;
  /** Set when address is inbox+tenant_user (second part not hex). */
  userSlug?: string;
  trackingCode: string | null;
};

/**
 * Extracts tenant, optional user slug, and tracking from incoming email.
 * - Address: inbox+{tenantSlug}_{userSlug}@ (tenant + user; no id in address).
 * - Body: lowly-tracking:{code} in HTML or plain text gives conversation (trackingCode).
 * Legacy: inbox+{tenantCode}_{trackingCode}@ still supported (second part = hex).
 */
export function parseTrackingCode(
  toAddress: string,
  htmlBody: string | null | undefined,
  textBody?: string | null
): ParsedTracking | null {
  let tenantCode: string | null = null;
  let userSlug: string | undefined;
  let trackingFromAddress: string | null = null;

  const local = toAddress
    ? (() => {
        const email =
          toAddress.includes("<") && toAddress.includes(">")
            ? toAddress.replace(/^.*<([^>]+)>.*$/, "$1").trim()
            : toAddress.trim();
        const at = email.indexOf("@");
        return at > 0 ? email.slice(0, at) : "";
      })()
    : "";

  if (local) {
    if (local.startsWith("inbox+")) {
      const fullCode = local.slice(6);
      if (fullCode) {
        if (fullCode.includes("_")) {
          const parts = fullCode.split("_");
          const first = parts[0];
          const second = parts[1];
          tenantCode = first ?? null;
          if (second) {
            if (LEGACY_TRACKING_PATTERN.test(second)) {
              trackingFromAddress = second;
            } else {
              userSlug = second;
            }
          }
        } else {
          tenantCode = fullCode;
        }
      }
    } else if (local.includes(".")) {
      const parts = local.split(".");
      tenantCode = parts.pop() ?? null;
      userSlug = parts.join(".");
    }
  }

  let trackingCode: string | null = trackingFromAddress;
  if (htmlBody) {
    const bodyMatch = htmlBody.match(HTML_TRACKING_REGEX);
    if (bodyMatch?.[1]) trackingCode = bodyMatch[1];
  }
  if (trackingCode == null && textBody) {
    const textMatch = textBody.match(TEXT_TRACKING_REGEX);
    if (textMatch?.[1]) trackingCode = textMatch[1];
  }

  if (!tenantCode) return null;
  return { tenantCode, ...(userSlug !== undefined && { userSlug }), trackingCode };
}
