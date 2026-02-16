"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Archive, Loader2, Send } from "lucide-react";
import {
  getConversation,
  replyToConversation,
  markConversationAsRead,
  archiveConversation,
} from "@/actions/email-conversations";
import type { ConversationWithMessages, EmailMessageData } from "@/services/email-conversations";
import { cn } from "@/lib/utils";

type ConversationSheetProps = {
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchiveSuccess?: () => void;
};

function formatMessageTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function MessageBubble({
  message,
  isOutbound,
}: {
  message: EmailMessageData;
  isOutbound: boolean;
}) {
  const displayName =
    message.fromName?.trim() || message.fromEmail;
  const body = message.bodyText?.trim() || message.bodyHtml?.replace(/<[^>]+>/g, "").trim() || "";

  return (
    <div
      className={cn(
        "flex",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isOutbound
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        <p className="font-medium text-xs opacity-90">{displayName}</p>
        <p className="whitespace-pre-wrap break-words mt-0.5">{body || "—"}</p>
        <p className="text-xs opacity-80 mt-1">
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function ConversationSheet({
  conversationId,
  open,
  onOpenChange,
  onArchiveSuccess,
}: ConversationSheetProps) {
  const t = useTranslations("email.inbox");
  const [conversation, setConversation] = useState<ConversationWithMessages | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPendingReply, startReplyTransition] = useTransition();
  const [isPendingArchive, startArchiveTransition] = useTransition();

  useEffect(() => {
    if (!open || !conversationId) {
      setConversation(null);
      setLoadError(null);
      setReplyBody("");
      return;
    }
    let cancelled = false;
    setLoadError(null);
    getConversation(conversationId)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setConversation(res.conversation);
          setReplyBody("");
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
  }, [open, conversationId]);

  const handleReply = () => {
    if (!conversationId || !replyBody.trim()) return;
    const html = replyBody.trim().replace(/\n/g, "<br>");
    startReplyTransition(async () => {
      const result = await replyToConversation(conversationId, {
        bodyHtml: `<p>${html}</p>`,
        bodyText: replyBody.trim(),
      });
      if (result.success) {
        setReplyBody("");
        const res = await getConversation(conversationId);
        if (res.success) setConversation(res.conversation);
      }
    });
  };

  const handleArchive = () => {
    if (!conversationId) return;
    startArchiveTransition(async () => {
      const result = await archiveConversation(conversationId);
      if (result.success) {
        onOpenChange(false);
        onArchiveSuccess?.();
      }
    });
  };

  const counterpart =
    conversation?.externalName?.trim() || conversation?.externalEmail || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col w-full sm:max-w-lg"
        showCloseButton
      >
        <SheetHeader className="shrink-0">
          <div className="flex items-start justify-between gap-2 pr-6">
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {conversation?.subject ?? t("loading")}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap mt-1">
                <span className="truncate">{counterpart}</span>
                {conversation?.projectName && (
                  <Badge variant="secondary" className="text-xs">
                    {conversation.projectName}
                  </Badge>
                )}
              </SheetDescription>
            </div>
            {conversation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleArchive}
                disabled={isPendingArchive}
                className="shrink-0"
              >
                {isPendingArchive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                <span className="sr-only">{t("archive")}</span>
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0 mt-4">
          {loadError && (
            <p className="text-sm text-destructive py-4">{loadError}</p>
          )}
          {conversation && !loadError && (
            <>
              <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                {conversation.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOutbound={msg.direction === "OUTBOUND"}
                  />
                ))}
              </div>
              <div className="border-t border-border pt-4 shrink-0 space-y-2">
                <Textarea
                  placeholder={t("replyPlaceholder")}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className="min-h-[80px] resize-none"
                  disabled={isPendingReply}
                />
                <Button
                  onClick={handleReply}
                  disabled={!replyBody.trim() || isPendingReply}
                  size="sm"
                  className="w-full gap-2"
                >
                  {isPendingReply ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t("sendReply")}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
