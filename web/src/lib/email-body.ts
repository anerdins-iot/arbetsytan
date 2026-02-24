/**
 * Email body formatting: markdown → HTML and markdown → plain text.
 * Used when the AI (or user) supplies body content that may be in markdown;
 * we convert to proper email format and support multipart (html + text).
 */

import { marked } from "marked";

const emailParagraphStyle =
  "margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 1.6;";
const emailHeadingStyle =
  "margin: 20px 0 10px; color: #111827; font-size: 18px; font-weight: 600;";
const emailListStyle =
  "margin: 0 0 8px 20px; color: #374151; font-size: 16px; line-height: 1.6;";
// Dark blue + underline so links are clearly visible on white background
const emailLinkStyle =
  "color: #1e3a8a; text-decoration: underline; font-weight: 500;";

/** Add inline styles to marked output for email client compatibility. */
function addEmailStyles(html: string): string {
  return html
    .replace(/<h1>/gi, `<h2 style="${emailHeadingStyle} font-size: 20px;">`)
    .replace(/<h2>/gi, `<h2 style="${emailHeadingStyle} font-size: 18px;">`)
    .replace(/<h3>/gi, `<h3 style="${emailHeadingStyle};">`)
    .replace(/<h4>/gi, `<h4 style="${emailHeadingStyle} font-size: 16px;">`)
    .replace(/<p>/gi, `<p style="${emailParagraphStyle}">`)
    .replace(/<ul>/gi, `<ul style="${emailListStyle} list-style-type: disc;">`)
    .replace(/<ol>/gi, `<ol style="${emailListStyle} list-style-type: decimal;">`)
    .replace(/<li>/gi, '<li style="margin: 0 0 4px;">')
    .replace(/<a /gi, `<a style="${emailLinkStyle}" `);
}

/**
 * Convert markdown body to HTML suitable for email (inline styles, safe tags).
 * Falls back to paragraph-wrapped plain text if content looks like plain text only.
 */
export function markdownToHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  // If there's no markdown-ish syntax, treat as plain text (paragraphs only)
  const hasMarkdown = /^#{1,6}\s|^[-*]\s|^\d+\.\s|\[.+\]\(.+\)|\*\*[^*]+\*\*|__[^_]+__/m.test(trimmed);
  if (!hasMarkdown) {
    return trimmed
      .split("\n\n")
      .map((p) => `<p style="${emailParagraphStyle}">${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  try {
    const raw = marked.parse(trimmed, { gfm: true, breaks: true }) as string;
    const html = typeof raw === "string" ? raw : trimmed;
    return addEmailStyles(html);
  } catch {
    return trimmed
      .split("\n\n")
      .map((p) => `<p style="${emailParagraphStyle}">${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
}

/**
 * Convert markdown to plain text for the text/plain part of multipart email.
 * Strips markdown syntax while keeping structure readable.
 */
export function markdownToPlainText(body: string): string {
  let t = body.trim();
  if (!t) return "";

  // Code blocks (fenced)
  t = t.replace(/^```[\s\S]*?^```/gm, (block) => {
    const lines = block.split("\n").slice(1, -1);
    return lines.join("\n") + "\n\n";
  });
  // Inline code
  t = t.replace(/`([^`]+)`/g, "$1");
  // Bold/italic
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1");
  // Links: [text](url) -> text
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Headings: # ## ### -> same line, no prefix
  t = t.replace(/^#{1,6}\s+/gm, "");
  // Unordered list: keep "- " or "* " as " - "
  t = t.replace(/^[\*\-]\s+/gm, " - ");
  // Ordered list: keep "1. " etc
  t = t.replace(/^\d+\.\s+/gm, " - ");
  // Horizontal rule
  t = t.replace(/^[-*_]{3,}\s*$/gm, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
