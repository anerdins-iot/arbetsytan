"use client";

import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import type { ConversationListItem } from "@/services/email-conversations";
import { ConversationCard } from "./conversation-card";

type ConversationListProps = {
  conversations: ConversationListItem[];
  emptyLabel: "emptyInbox" | "emptySent";
  emptyDescription: "emptyInboxDescription" | "emptySentDescription";
  onSelectConversation: (id: string) => void;
};

export function ConversationList({
  conversations,
  emptyLabel,
  emptyDescription,
  onSelectConversation,
}: ConversationListProps) {
  const t = useTranslations("email.inbox");

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm font-medium text-foreground">{t(emptyLabel)}</p>
        <p className="text-sm text-muted-foreground mt-1">{t(emptyDescription)}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" role="list">
      {conversations.map((conv) => (
        <li key={conv.id}>
          <ConversationCard
            conversation={conv}
            onClick={() => onSelectConversation(conv.id)}
          />
        </li>
      ))}
    </ul>
  );
}
