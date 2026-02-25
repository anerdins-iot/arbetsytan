"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

type EmailHtmlRendererProps = {
  html: string | null | undefined;
  text: string | null | undefined;
  fallback?: string;
};

export function EmailHtmlRenderer({
  html,
  text,
  fallback,
}: EmailHtmlRendererProps) {
  const sanitizedHtml = useMemo(() => {
    if (html && html.trim()) {
      return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["target"],
      });
    }
    return null;
  }, [html]);

  if (sanitizedHtml) {
    return (
      <div
        className="email-body text-sm leading-relaxed text-foreground [&_a]:text-blue-500 [&_a]:underline [&_a]:break-all [&_img]:max-w-full [&_img]:h-auto [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_br]:leading-relaxed [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_table]:border-collapse [&_table]:w-full [&_td]:p-1 [&_th]:p-1 [&_hr]:border-border [&_hr]:my-3"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  if (text && text.trim()) {
    return (
      <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
        {text}
      </div>
    );
  }

  if (fallback) {
    return (
      <div className="text-sm text-muted-foreground italic">{fallback}</div>
    );
  }

  return null;
}
