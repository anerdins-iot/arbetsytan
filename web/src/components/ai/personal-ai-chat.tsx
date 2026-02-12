"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, History, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  getPersonalConversations,
  getConversationWithMessages,
} from "@/actions/conversations";
import type { ConversationListItem } from "@/actions/conversations";
import { cn } from "@/lib/utils";

function formatConversationDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PersonalAiChat() {
  const t = useTranslations("personalAi");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const [inputValue, setInputValue] = useState("");

  const {
    messages,
    setMessages,
    status,
    sendMessage,
    error,
    stop,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/chat",
      body: () => ({
        ...(conversationId ? { conversationId } : {}),
      }),
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        const convId = res.headers.get("X-Conversation-Id");
        if (convId) setConversationId(convId);
        return res;
      },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  const loadConversations = useCallback(async () => {
    setLoadingHistory(true);
    const result = await getPersonalConversations();
    setLoadingHistory(false);
    if (result.success) setConversations(result.conversations);
  }, []);

  useEffect(() => {
    if (historyOpen) void loadConversations();
  }, [historyOpen, loadConversations]);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setHistoryOpen(false);
  }, [setMessages]);

  const loadConversation = useCallback(
    async (convId: string) => {
      const result = await getConversationWithMessages(convId);
      if (!result.success) return;
      setConversationId(result.conversation.id);
      const uiMessages = result.messages.map((m) => ({
        id: m.id,
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        parts: [{ type: "text" as const, text: m.content }],
      }));
      setMessages(uiMessages);
      setHistoryOpen(false);
    },
    [setMessages]
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const text = inputValue.trim();
      if (!text || isLoading) return;
      sendMessage({ text });
      setInputValue("");
    },
    [inputValue, isLoading, sendMessage]
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            size="icon"
            className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
            aria-label={t("open")}
          >
            <MessageCircle className="size-7" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-l border-border bg-card p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-left">
              <MessageCircle className="size-5 text-muted-foreground" />
              {t("title")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("history")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startNewConversation}
                  className="text-muted-foreground"
                >
                  {t("newConversation")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("history")}
                  onClick={() => setHistoryOpen((o) => !o)}
                >
                  <History className="size-4" />
                </Button>
              </div>
            </div>

            {historyOpen && (
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                {loadingHistory ? (
                  <p className="text-sm text-muted-foreground">{t("loading")}</p>
                ) : conversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("noConversations")}
                  </p>
                ) : (
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {conversations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => loadConversation(c.id)}
                        className={cn(
                          "flex flex-col items-start rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted hover:border-border",
                          conversationId === c.id && "bg-muted border-border"
                        )}
                      >
                        <span className="line-clamp-1 font-medium text-foreground">
                          {c.title || t("newConversation")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatConversationDate(c.updatedAt)} ·{" "}
                          {t("messageCount", { count: c.messageCount })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 && !error && (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <MessageCircle className="mb-2 size-10 opacity-50" />
                  <p className="text-sm">{t("placeholder")}</p>
                </div>
              )}
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex flex-col gap-1",
                      message.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {(message.parts ?? [])
                        .filter(
                          (part): part is { type: "text"; text: string } =>
                            part.type === "text"
                        )
                        .map((part, i) => (
                          <p key={i} className="whitespace-pre-wrap">
                            {part.text}
                          </p>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {t("error")}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="flex gap-2 border-t border-border p-3"
            >
              <Textarea
                value={inputValue}
                onChange={handleInputChange}
                placeholder={t("placeholder")}
                disabled={isLoading}
                rows={1}
                className="min-h-10 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              {isLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => stop()}
                  aria-label={t("loading")}
                >
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputValue.trim()}
                  aria-label={t("send")}
                >
                  <Send className="size-4" />
                </Button>
              )}
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
