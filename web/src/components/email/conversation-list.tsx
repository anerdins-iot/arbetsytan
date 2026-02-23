"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Inbox, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationListItem } from "@/services/email-conversations";
import { ConversationCard } from "./conversation-card";

type ConversationListProps = {
  conversations: ConversationListItem[];
  selectedId: string | null;
  emptyLabel: "emptyInbox" | "emptySent";
  emptyDescription: "emptyInboxDescription" | "emptySentDescription";
  onSelectConversation: (id: string) => void;
};

export function ConversationList({
  conversations,
  selectedId,
  emptyLabel,
  emptyDescription,
  onSelectConversation,
}: ConversationListProps) {
  const t = useTranslations("email.inbox");
  const tList = useTranslations("email.list");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.externalEmail.toLowerCase().includes(q) ||
        (c.externalName?.toLowerCase().includes(q) ?? false) ||
        (c.latestMessage?.bodyText?.toLowerCase().includes(q) ?? false)
    );
  }, [conversations, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tList("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? tList("searchPlaceholder") : t(emptyLabel)}
            </p>
            {!searchQuery && (
              <p className="text-xs text-muted-foreground mt-1">
                {t(emptyDescription)}
              </p>
            )}
          </div>
        ) : (
          <div role="list">
            {filtered.map((conv) => (
              <ConversationCard
                key={conv.id}
                conversation={conv}
                onClick={() => onSelectConversation(conv.id)}
                isSelected={conv.id === selectedId}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
