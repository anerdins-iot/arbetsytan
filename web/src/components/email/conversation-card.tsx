"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@/services/email-conversations";
import { getPreviewText } from "./email-body-utils";

type ConversationCardProps = {
  conversation: ConversationListItem;
  onClick: () => void;
  isSelected?: boolean;
};

function formatDate(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(d).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) {
    return new Date(d).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (days < 7) {
    return new Date(d).toLocaleDateString(undefined, { weekday: "short" });
  }
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ConversationCard({
  conversation,
  onClick,
  isSelected = false,
}: ConversationCardProps) {
  const t = useTranslations("email.inbox");
  const tList = useTranslations("email.list");
  const sender =
    conversation.externalName?.trim() || conversation.externalEmail;
  const previewText = getPreviewText(
    conversation.latestMessage?.bodyText,
    conversation.latestMessage?.bodyHtml,
    80
  ) || tList("noContent");
  const isUnread = (conversation.unreadCount ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 transition-colors border-b border-border/50",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        isSelected && "bg-primary/5 border-l-2 border-l-primary",
        !isSelected && isUnread && "bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Unread indicator */}
        <div className="pt-1.5 shrink-0 w-2">
          {isUnread && (
            <span
              className="block size-2 rounded-full bg-accent"
              title={t("unread")}
              aria-hidden
            />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm truncate",
                isUnread ? "font-semibold text-foreground" : "font-medium text-foreground"
              )}
            >
              {sender}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {formatDate(conversation.lastMessageAt)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <p
              className={cn(
                "text-sm truncate",
                isUnread ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {conversation.subject || t("noSubject")}
            </p>
            {conversation.projectId && conversation.projectName && (
              <Badge
                variant="secondary"
                className="text-[10px] shrink-0 px-1.5 py-0 h-4"
              >
                {conversation.projectName}
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {previewText}
          </p>
        </div>
      </div>
    </button>
  );
}
