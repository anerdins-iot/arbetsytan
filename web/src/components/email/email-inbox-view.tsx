"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";
import { ConversationList } from "./conversation-list";
import { ConversationSheet } from "./conversation-sheet";
import { NewConversationComposer } from "./new-conversation-composer";
import type { ConversationListItem } from "@/services/email-conversations";

type ProjectOption = { id: string; name: string };

type EmailInboxViewProps = {
  projects: ProjectOption[];
  inboxConversations: ConversationListItem[];
  sentConversations: ConversationListItem[];
};

export function EmailInboxView({
  projects,
  inboxConversations,
  sentConversations,
}: EmailInboxViewProps) {
  const t = useTranslations("email.inbox");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");
  const sheetOpen = Boolean(conversationId);

  const openConversation = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("conversationId", id);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const closeSheet = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  const handleComposerSuccess = useCallback(
    (newConversationId: string) => {
      openConversation(newConversationId);
      router.push(`${pathname}?conversationId=${newConversationId}`);
    },
    [openConversation, pathname, router]
  );

  useSocketEvent(SOCKET_EVENTS.emailNew, () => router.refresh());

  return (
    <>
      <Tabs defaultValue="inbox" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="inbox" data-state="inbox">
            {t("tabInbox")}
          </TabsTrigger>
          <TabsTrigger value="sent" data-state="sent">
            {t("tabSent")}
          </TabsTrigger>
          <TabsTrigger value="compose" data-state="compose">
            {t("tabCompose")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <ConversationList
            conversations={inboxConversations}
            emptyLabel="emptyInbox"
            emptyDescription="emptyInboxDescription"
            onSelectConversation={openConversation}
          />
        </TabsContent>
        <TabsContent value="sent">
          <ConversationList
            conversations={sentConversations}
            emptyLabel="emptySent"
            emptyDescription="emptySentDescription"
            onSelectConversation={openConversation}
          />
        </TabsContent>
        <TabsContent value="compose">
          <NewConversationComposer
            projects={projects}
            onSuccess={handleComposerSuccess}
          />
        </TabsContent>
      </Tabs>

      <ConversationSheet
        conversationId={conversationId}
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        onArchiveSuccess={() => router.refresh()}
      />
    </>
  );
}
