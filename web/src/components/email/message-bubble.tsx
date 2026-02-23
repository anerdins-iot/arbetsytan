"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EmailMessageData } from "@/services/email-conversations";
import { getReadableBody } from "./email-body-utils";

type MessageBubbleProps = {
  message: EmailMessageData;
  isOutbound: boolean;
};

function formatMessageTime(d: Date): string {
  return new Date(d).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({ message, isOutbound }: MessageBubbleProps) {
  const t = useTranslations("email.conversation");
  const displayName = isOutbound
    ? t("you")
    : message.fromName?.trim() || message.fromEmail;
  const body = getReadableBody(message.bodyText, message.bodyHtml, t("noContent"));

  return (
    <div
      className={cn(
        "flex",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
          isOutbound
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card text-card-foreground border border-border rounded-bl-md"
        )}
      >
        <p
          className={cn(
            "text-xs font-medium mb-1",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {displayName}
        </p>
        <p className="whitespace-pre-wrap break-words leading-relaxed">{body}</p>
        <p
          className={cn(
            "text-[10px] mt-1.5 text-right",
            isOutbound ? "text-primary-foreground/50" : "text-muted-foreground/60"
          )}
        >
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
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
