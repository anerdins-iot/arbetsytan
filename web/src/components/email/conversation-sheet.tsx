"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, Loader2, Mail, ArrowLeft } from "lucide-react";
import {
  getConversation,
  replyToConversation,
  markConversationAsRead,
  archiveConversation,
} from "@/actions/email-conversations";
import type {
  ConversationWithMessages,
  EmailMessageData,
} from "@/services/email-conversations";
import { MessageItem, DateSeparator } from "./message-item";
import { ReplyBox } from "./reply-box";

type ConversationViewProps = {
  conversationId: string | null;
  onArchiveSuccess?: () => void;
  onBack?: () => void;
};

function formatDateHeader(d: Date): string {
  const date = new Date(d);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return new Date(d).toLocaleDateString(undefined, {
      weekday: "long",
    });
  }
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDateKey(d: Date): string {
  const date = new Date(d);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function groupMessagesByDate(
  messages: EmailMessageData[]
): { dateKey: string; dateLabel: string; messages: EmailMessageData[] }[] {
  const groups: Map<
    string,
    { dateLabel: string; messages: EmailMessageData[] }
  > = new Map();

  for (const msg of messages) {
    const key = getDateKey(msg.createdAt);
    if (!groups.has(key)) {
      groups.set(key, {
        dateLabel: formatDateHeader(msg.createdAt),
        messages: [],
      });
    }
    groups.get(key)!.messages.push(msg);
  }

  return Array.from(groups.entries()).map(([dateKey, group]) => ({
    dateKey,
    ...group,
  }));
}

export function ConversationView({
  conversationId,
  onArchiveSuccess,
  onBack,
}: ConversationViewProps) {
  const t = useTranslations("email.conversation");
  const tInbox = useTranslations("email.inbox");
  const [conversation, setConversation] =
    useState<ConversationWithMessages | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPendingReply, startReplyTransition] = useTransition();
  const [isPendingArchive, startArchiveTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    getConversation(conversationId)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setConversation(res.conversation);
          markConversationAsRead(conversationId).catch(() => {});
        } else {
          setLoadError(res.error ?? "UNKNOWN_ERROR");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("UNKNOWN_ERROR");
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const handleReply = async (bodyText: string, bodyHtml: string) => {
    if (!conversationId) return;
    startReplyTransition(async () => {
      const result = await replyToConversation(conversationId, {
        bodyHtml,
        bodyText,
      });
      if (result.success) {
        const res = await getConversation(conversationId);
        if (res.success) {
          setConversation(res.conversation);
          // Scroll to top to see the newest message
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = 0;
            }
          });
        }
      }
    });
  };

  const handleArchive = () => {
    if (!conversationId) return;
    startArchiveTransition(async () => {
      const result = await archiveConversation(conversationId);
      if (result.success) {
        setConversation(null);
        onArchiveSuccess?.();
      }
    });
  };

  // Empty state — no conversation selected
  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Mail className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-foreground">
          {t("selectConversation")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {t("selectConversationDescription")}
        </p>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  // Loading state
  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const counterpart =
    conversation.externalName?.trim() || conversation.externalEmail || "";
  // Reverse: newest message first (like Gmail)
  const reversedMessages = [...conversation.messages].reverse();
  const messageGroups = groupMessagesByDate(reversedMessages);
  const latestMessageId = reversedMessages[0]?.id;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 bg-card shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="shrink-0 md:hidden h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">{t("back")}</span>
              </Button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate">
                {conversation.subject || tInbox("noSubject")}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground truncate">
                  {counterpart}
                </span>
                {conversation.projectName && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {conversation.projectName}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
            disabled={isPendingArchive}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {isPendingArchive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">
              {tInbox("archive")}
            </span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="px-4 py-4 space-y-3">
          {messageGroups.map((group) => (
            <div key={group.dateKey}>
              <DateSeparator date={group.dateLabel} />
              <div className="space-y-3">
                {group.messages.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isOutbound={msg.direction === "OUTBOUND"}
                    defaultExpanded={msg.id === latestMessageId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reply box */}
      <ReplyBox onSend={handleReply} isPending={isPendingReply} />
    </div>
  );
}

// Keep backwards-compat export name
export { ConversationView as ConversationSheet };
