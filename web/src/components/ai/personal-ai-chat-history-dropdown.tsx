"use client";

import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@/actions/conversations";

export type PersonalAiChatHistoryDropdownProps = {
  open: boolean;
  loading: boolean;
  conversations: ConversationListItem[];
  selectedConversationId: string | null;
  onSelect: (convId: string) => void;
  onNewConversation: () => void;
  t: (key: string, values?: Record<string, number | string>) => string;
  formatDate: (date: Date) => string;
};

export function PersonalAiChatHistoryDropdown({
  open,
  loading,
  conversations,
  selectedConversationId,
  onSelect,
  t,
  formatDate,
}: PersonalAiChatHistoryDropdownProps) {
  if (!open) return null;

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
      ) : (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex flex-col items-start rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted hover:border-border",
                selectedConversationId === c.id && "bg-muted border-border"
              )}
            >
              <span className="line-clamp-1 font-medium text-foreground">
                {c.title || t("newConversation")}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(c.updatedAt)} · {t("messageCount", { count: c.messageCount })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
