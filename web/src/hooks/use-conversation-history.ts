"use client";

import { useCallback, useEffect, useState } from "react";
import { getPersonalConversations, getConversationWithMessages } from "@/actions/conversations";
import type { ConversationListItem } from "@/actions/conversations";

export type ConversationHistoryCallbacks = {
  setConversationId: (id: string | null) => void;
  setMessages: (messages: Array<{ id: string; role: "user" | "assistant"; parts: Array<{ type: "text"; text: string }> }>) => void;
  setNextCursor: (cursor: string | null) => void;
  setHasMore: (value: boolean) => void;
  onConversationLoaded?: (lastMessageId: string | null) => void;
};

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
        parts: [{ type: "text" as const, text: m.content }],
      }));
      setMessages(uiMessages);
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
