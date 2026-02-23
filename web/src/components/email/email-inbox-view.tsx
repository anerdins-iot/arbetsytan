"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";
import { cn } from "@/lib/utils";
import { EmailSidebar, type EmailView } from "./email-sidebar";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-sheet";
import { NewConversationComposer } from "./new-conversation-composer";
import type { ConversationListItem } from "@/services/email-conversations";

type ProjectOption = { id: string; name: string };

type EmailInboxViewProps = {
  projects: ProjectOption[];
  inboxConversations: ConversationListItem[];
  sentConversations: ConversationListItem[];
  unreadCount: number;
};

export function EmailInboxView({
  projects,
  inboxConversations,
  sentConversations,
  unreadCount,
}: EmailInboxViewProps) {
  const t = useTranslations("email.inbox");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");

  const [currentView, setCurrentView] = useState<EmailView>("inbox");
  // On mobile, track which panel is showing
  const [mobilePanel, setMobilePanel] = useState<
    "sidebar" | "list" | "conversation"
  >(conversationId ? "conversation" : "list");

  const openConversation = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("conversationId", id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      setMobilePanel("conversation");
    },
    [pathname, router, searchParams]
  );

  const closeConversation = useCallback(() => {
    router.push(pathname, { scroll: false });
    setMobilePanel("list");
  }, [pathname, router]);

  const handleViewChange = useCallback(
    (view: EmailView) => {
      setCurrentView(view);
      // Clear selected conversation when switching views
      if (conversationId) {
        router.push(pathname, { scroll: false });
      }
      setMobilePanel("list");
    },
    [conversationId, pathname, router]
  );

  const handleComposerSuccess = useCallback(
    (newConversationId: string) => {
      setCurrentView("inbox");
      openConversation(newConversationId);
    },
    [openConversation]
  );

  useSocketEvent(SOCKET_EVENTS.emailNew, () => router.refresh());

  const conversations =
    currentView === "sent" ? sentConversations : inboxConversations;
  const emptyLabel = currentView === "sent" ? "emptySent" as const : "emptyInbox" as const;
  const emptyDescription =
    currentView === "sent"
      ? ("emptySentDescription" as const)
      : ("emptyInboxDescription" as const);

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-lg border border-border overflow-hidden bg-card">
      {/* Sidebar — hidden on mobile */}
      <aside
        className={cn(
          "w-[200px] shrink-0 border-r border-border hidden md:flex flex-col"
        )}
      >
        <EmailSidebar
          currentView={currentView}
          onViewChange={handleViewChange}
          unreadCount={unreadCount}
        />
      </aside>

      {/* Conversation List / Compose — middle panel */}
      <div
        className={cn(
          "w-full md:w-[340px] lg:w-[380px] shrink-0 border-r border-border flex flex-col",
          // Mobile: hide list when viewing conversation
          mobilePanel === "conversation" && "hidden md:flex"
        )}
      >
        {/* Mobile tabs — shown only on mobile as sidebar replacement */}
        <div className="md:hidden flex border-b border-border">
          <MobileTab
            active={currentView === "inbox"}
            onClick={() => handleViewChange("inbox")}
            label={t("tabInbox")}
            badge={unreadCount > 0 ? unreadCount : undefined}
          />
          <MobileTab
            active={currentView === "sent"}
            onClick={() => handleViewChange("sent")}
            label={t("tabSent")}
          />
          <MobileTab
            active={currentView === "compose"}
            onClick={() => handleViewChange("compose")}
            label={t("tabCompose")}
          />
        </div>

        {currentView === "compose" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <NewConversationComposer
              projects={projects}
              onSuccess={handleComposerSuccess}
            />
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={conversationId}
            emptyLabel={emptyLabel}
            emptyDescription={emptyDescription}
            onSelectConversation={openConversation}
          />
        )}
      </div>

      {/* Conversation View — right panel */}
      <div
        className={cn(
          "flex-1 min-w-0 flex flex-col",
          // Mobile: hide when not viewing conversation
          mobilePanel !== "conversation" && "hidden md:flex"
        )}
      >
        <ConversationView
          conversationId={conversationId}
          onArchiveSuccess={() => {
            closeConversation();
            router.refresh();
          }}
          onBack={closeConversation}
        />
      </div>
    </div>
  );
}

function MobileTab({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2.5 text-sm font-medium text-center transition-colors relative",
        active
          ? "text-primary border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-4 min-w-4 px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
