"use client";

import { EmailPreviewCard, type EmailPreviewData } from "@/components/ai/email-preview-card";
import { ReportPreviewCard, type ReportPreviewData } from "@/components/ai/report-preview-card";
import { SearchResultsCard, type SearchResult } from "@/components/ai/search-results-card";
import { QuotePreviewCard, type QuotePreviewData } from "@/components/ai/quote-preview-card";
import { QuoteList, type SerializedQuote } from "@/components/quotes/quote-list";
import { NoteCard } from "@/components/projects/note-card";
import { TimeEntryList } from "@/components/time/time-entry-list";
import { FileListGrid, type FileListGridItem } from "@/components/files/file-list-grid";
import { TaskList } from "@/components/dashboard/task-list";
import { ShoppingListsClient } from "@/app/[locale]/(dashboard)/shopping-lists/shopping-lists-client";
import type { NoteListPanelData } from "@/components/ai/personal-ai-chat-types";
import type { NoteCategoryItem } from "@/actions/note-categories";
import type { DashboardTask } from "@/actions/dashboard";
import type { GroupedTimeEntries } from "@/actions/time-entries";
import type { SerializedShoppingListItem } from "@/actions/shopping-list";

export type PersonalAiChatPanelType =
  | "email"
  | "quote"
  | "search"
  | "report"
  | "quoteList"
  | "noteList"
  | "timeEntry"
  | "fileList"
  | "taskList"
  | "shoppingList";

export type PersonalAiChatPanelData =
  | (EmailPreviewData & { memberIds?: string[] })
  | QuotePreviewData
  | SearchResult[]
  | ReportPreviewData
  | { quotes: SerializedQuote[]; count: number }
  | NoteListPanelData
  | { groupedEntries: GroupedTimeEntries[]; tasks: Array<{ id: string; title: string }> }
  | { files: FileListGridItem[]; count: number; projectId?: string; projectName?: string }
  | { tasks: DashboardTask[]; count: number; projectId?: string; projectName?: string }
  | { lists: SerializedShoppingListItem[]; count: number };

export type PersonalAiChatToolPanelContentCallbacks = {
  onReportGenerate: (data: ReportPreviewData) => Promise<{ success: boolean }>;
  generateQuotePdf: (data: QuotePreviewData) => Promise<unknown>;
  onEmailSend: (data: EmailPreviewData & { memberIds?: string[] }) => Promise<unknown>;
  onEmailCancel: () => void;
  onShoppingListsRefresh: () => Promise<void>;
};

export type PersonalAiChatToolPanelContentProps = {
  panelType: PersonalAiChatPanelType;
  panelData: PersonalAiChatPanelData | null;
  onClose?: () => void;
  t: (key: string) => string;
  tQuotes: (key: string) => string;
  tShopping: (key: string) => string;
  noteListCategories: NoteCategoryItem[];
  timeEntryPanelLoading: boolean;
  timeEntryPanelData: {
    groupedEntries: GroupedTimeEntries[];
    tasks: Array<{ id: string; title: string }>;
  } | null;
  callbacks: PersonalAiChatToolPanelContentCallbacks;
};

export function PersonalAiChatToolPanelContent({
  panelType,
  panelData,
  t,
  tQuotes,
  tShopping,
  noteListCategories,
  timeEntryPanelLoading,
  timeEntryPanelData,
  callbacks,
}: PersonalAiChatToolPanelContentProps) {
  switch (panelType) {
    case "email": {
      const data = panelData as (EmailPreviewData & { memberIds?: string[] }) | null;
      if (!data) return null;
      return (
        <EmailPreviewCard
          data={data}
          onSend={() => callbacks.onEmailSend(data)}
          onCancel={callbacks.onEmailCancel}
        />
      );
    }
    case "quote": {
      const data = panelData as QuotePreviewData | null;
      if (!data) return null;
      return (
        <QuotePreviewCard
          data={data}
          onGenerate={() => callbacks.generateQuotePdf(data)}
        />
      );
    }
    case "search": {
      const data = panelData as SearchResult[] | null;
      if (!data) return null;
      return <SearchResultsCard results={data} />;
    }
    case "report": {
      const data = panelData as ReportPreviewData | null;
      if (!data) return null;
      return (
        <ReportPreviewCard
          data={data}
          onGenerate={callbacks.onReportGenerate}
        />
      );
    }
    case "quoteList": {
      const data = panelData as { quotes: SerializedQuote[]; count: number } | null;
      if (!data) return null;
      return <QuoteList initialQuotes={data.quotes} />;
    }
    case "noteList": {
      const data = panelData as NoteListPanelData | null;
      if (!data) return null;
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              projectId={data.projectId ?? null}
              onUpdate={() => {}}
              categories={noteListCategories}
            />
          ))}
        </div>
      );
    }
    case "timeEntry":
      if (timeEntryPanelLoading) {
        return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
      }
      if (timeEntryPanelData) {
        return (
          <TimeEntryList
            groupedEntries={timeEntryPanelData.groupedEntries}
            tasks={timeEntryPanelData.tasks}
          />
        );
      }
      return null;
    case "fileList": {
      const data = panelData as { files: FileListGridItem[]; count: number; projectId?: string; projectName?: string } | null;
      if (!data) return null;
      return (
        <FileListGrid
          files={data.files}
          translationNamespace="projects.files"
          showActions
        />
      );
    }
    case "taskList": {
      const data = panelData as { tasks: DashboardTask[]; count: number; projectId?: string; projectName?: string } | null;
      if (!data) return null;
      return <TaskList tasks={data.tasks} />;
    }
    case "shoppingList": {
      const data = panelData as { lists: SerializedShoppingListItem[]; count: number } | null;
      if (!data) return null;
      return (
        <ShoppingListsClient
          initialLists={data.lists}
          onRefresh={callbacks.onShoppingListsRefresh}
        />
      );
    }
    default:
      return null;
  }
}
