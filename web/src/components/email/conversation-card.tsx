"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@/services/email-conversations";

type ConversationCardProps = {
  conversation: ConversationListItem;
  onClick: () => void;
};

const PREVIEW_MAX_LEN = 80;

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

function preview(text: string | null): string {
  if (!text || !text.trim()) return "";
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length <= PREVIEW_MAX_LEN
    ? plain
    : plain.slice(0, PREVIEW_MAX_LEN) + "…";
}

export function ConversationCard({ conversation, onClick }: ConversationCardProps) {
  const t = useTranslations("email.inbox");
  const sender =
    conversation.externalName?.trim() || conversation.externalEmail;
  const previewText = preview(conversation.latestMessage?.bodyText ?? null);
  const isUnread = (conversation.unreadCount ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isUnread && "bg-muted/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "truncate font-medium text-foreground",
                isUnread && "font-semibold"
              )}
            >
              {sender}
            </span>
            {conversation.projectId && conversation.projectName && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {conversation.projectName}
              </Badge>
            )}
          </div>
          <p
            className={cn(
              "text-sm truncate mt-0.5",
              isUnread ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            {conversation.subject || t("noSubject")}
          </p>
          {previewText && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {previewText}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isUnread && (
            <span
              className="size-2 rounded-full bg-primary"
              title={t("unread")}
              aria-hidden
            />
          )}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(conversation.lastMessageAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
