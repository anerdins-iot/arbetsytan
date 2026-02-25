"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, User, Mail } from "lucide-react";
import type { EmailMessageData } from "@/services/email-conversations";
import { getPreviewText } from "./email-body-utils";
import { EmailHtmlRenderer } from "./email-html-renderer";

type MessageItemProps = {
  message: EmailMessageData;
  isOutbound: boolean;
  defaultExpanded?: boolean;
};

function formatMessageTime(d: Date): string {
  return new Date(d).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageItem({
  message,
  isOutbound,
  defaultExpanded = false,
}: MessageItemProps) {
  const t = useTranslations("email.conversation");
  const [expanded, setExpanded] = useState(defaultExpanded);

  const displayName = isOutbound
    ? t("you")
    : message.fromName?.trim() || message.fromEmail;

  const recipient = isOutbound
    ? message.toEmail
    : message.fromEmail;

  const preview = getPreviewText(message.bodyText, message.bodyHtml, 120);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        isOutbound
          ? "border-l-2 border-l-primary"
          : "border-l-2 border-l-accent"
      )}
    >
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {/* Expand/collapse icon */}
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        {/* Sender icon */}
        <span
          className={cn(
            "shrink-0 flex items-center justify-center h-8 w-8 rounded-full",
            isOutbound
              ? "bg-primary/10 text-primary"
              : "bg-accent/10 text-accent-foreground"
          )}
        >
          {isOutbound ? (
            <User className="h-4 w-4" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
        </span>

        {/* Name, recipient, preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatMessageDate(message.createdAt)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {t("to")} {isOutbound ? message.toEmail : recipient}
          </div>
          {!expanded && preview && (
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {preview}
            </p>
          )}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <EmailHtmlRenderer
            html={message.bodyHtml}
            text={message.bodyText}
            fallback={t("noContent")}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Date separator shown between messages from different days.
 */
export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground font-medium px-2">
        {date}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
