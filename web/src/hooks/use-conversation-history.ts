"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { getPersonalConversations, getConversationWithMessages } from "@/actions/conversations";
import type { ConversationListItem } from "@/actions/conversations";

/** One part of a UI message: text or tool (with state/output for re-rendering cards). */
export type HistoryMessagePart =
  | { type: "text"; text: string }
  | { type: string; state?: string; output?: unknown; toolCallId?: string; toolName?: string };

export type ConversationHistoryCallbacks = {
  setConversationId: (id: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  setNextCursor: (cursor: string | null) => void;
  setHasMore: (value: boolean) => void;
  onConversationLoaded?: (lastMessageId: string | null) => void;
};

/**
 * Parse Message.content into UI message parts.
 * Stored format v1: { v: 1, id, role, parts: [...] } for assistant messages with tool results.
 * Export for use when loading more messages (e.g. in personal-ai-chat).
 */
export function contentToParts(content: string, role: "USER" | "ASSISTANT"): HistoryMessagePart[] {
  const raw = (content ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { v?: number; parts?: unknown[] };
      if (parsed.v === 1 && Array.isArray(parsed.parts) && role === "ASSISTANT") {
        return parsed.parts.map((p) => {
          const part = p as Record<string, unknown>;
          if (part.type === "text" && typeof part.text === "string") {
            return { type: "text" as const, text: part.text };
          }
          return {
            type: (part.type as string) ?? "tool-invocation",
            state: part.state as string | undefined,
            output: part.output,
            toolCallId: part.toolCallId as string | undefined,
            toolName: part.toolName as string | undefined,
          };
        });
      }
    } catch {
      // fall through to plain text
    }
  }
  return [{ type: "text" as const, text: raw }];
}

export function useConversationHistory(callbacks: ConversationHistoryCallbacks) {
  const {
    setConversationId,
    setMessages,
    setNextCursor,
    setHasMore,
    onConversationLoaded,
  } = callbacks;

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoadingHistory(true);
    const result = await getPersonalConversations();
    setLoadingHistory(false);
    if (result.success) setConversations(result.conversations);
  }, []);

  useEffect(() => {
    if (historyOpen) void loadConversations();
  }, [historyOpen, loadConversations]);

  const loadConversation = useCallback(
    async (convId: string) => {
      const result = await getConversationWithMessages(convId);
      if (!result.success) return;
      setConversationId(result.conversation.id);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      const uiMessages = result.messages.map((m) => ({
        id: m.id,
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        parts: contentToParts(m.content, m.role),
      }));
      setMessages(uiMessages as UIMessage[]);
      setHistoryOpen(false);
      onConversationLoaded?.(uiMessages[uiMessages.length - 1]?.id ?? null);
    },
    [setConversationId, setMessages, setNextCursor, setHasMore, onConversationLoaded]
  );

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setNextCursor(null);
    setHasMore(false);
    setHistoryOpen(false);
  }, [setConversationId, setMessages, setNextCursor, setHasMore]);

  return {
    conversations,
    loadingHistory,
    historyOpen,
    setHistoryOpen,
    loadConversations,
    loadConversation,
    startNewConversation,
  };
}
