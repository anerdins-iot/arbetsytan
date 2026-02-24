"use client";

import {
  Mail,
  Search,
  BarChart2,
  FileText,
  StickyNote,
  Clock,
  ListTodo,
  List,
  FolderOpen,
} from "lucide-react";
import { ChatResultButton } from "@/components/ai/chat-result-button";
import { FileCreatedCard } from "@/components/ai/file-created-card";
import { DeleteConfirmationCard, type DeleteConfirmationData } from "@/components/ai/delete-confirmation-card";
import { WholesalerSearchResultButton } from "@/components/ai/wholesaler-search-result-button";
import type { EmailPreviewData, EmailAttachment } from "@/components/ai/email-preview-card";
import type { FileCreatedData } from "@/components/ai/file-created-card";
import type { ReportPreviewData } from "@/components/ai/report-preview-card";
import type { QuotePreviewData } from "@/components/ai/quote-preview-card";
import type { SearchResult } from "@/components/ai/search-results-card";
import type { NoteListPanelData } from "@/components/ai/personal-ai-chat-types";
import type { SerializedQuote } from "@/components/quotes/quote-list";
import type { FileListGridItem } from "@/components/files/file-list-grid";
import type { DashboardTask } from "@/actions/dashboard";
import type { SerializedShoppingListItem } from "@/actions/shopping-list";
import type { WholesalerProduct } from "@/lib/wholesaler-search";
import type { MessagePart } from "@/components/ai/personal-ai-chat-message-parts";

export type PersonalAiChatToolCardCallbacks = {
  setOpenQuoteData: (data: QuotePreviewData | null) => void;
  setOpenSearchResults: (results: SearchResult[] | null) => void;
  setOpenReportData: (data: ReportPreviewData | null) => void;
  setOpenEmailPreviewData: (data: (EmailPreviewData & { memberIds?: string[] }) | null) => void;
  setOpenFileListData: (data: { files: FileListGridItem[]; count: number; projectId?: string; projectName?: string } | null) => void;
  setOpenTaskListData: (data: { tasks: DashboardTask[]; count: number; projectId?: string; projectName?: string } | null) => void;
  setOpenShoppingListsData: (data: { lists: SerializedShoppingListItem[]; count: number } | null) => void;
  setOpenTimeEntryPanel: (open: boolean) => void;
  setOpenQuoteListData: (data: { quotes: SerializedQuote[]; count: number } | null) => void;
  setOpenNoteListData: (data: NoteListPanelData | null) => void;
  onReportGenerate: (finalData: ReportPreviewData) => Promise<{ success: boolean }>;
  onDeleteConfirm: (data: DeleteConfirmationData & { actionParams: Record<string, string> }) => Promise<{ success: boolean; error?: string }>;
  openWholesalerPanel: (data: { query: string; products: WholesalerProduct[]; count: number }) => void;
};

type PersonalAiChatToolCardProps = {
  part: MessagePart;
  toolCardKey: string;
  callbacks: PersonalAiChatToolCardCallbacks;
  t: (key: string, values?: Record<string, string | number>) => string;
  tQuotes: (key: string, values?: Record<string, string | number>) => string;
  tShopping: (key: string, values?: Record<string, string | number>) => string;
};

export function PersonalAiChatToolCard({
  part,
  toolCardKey,
  callbacks,
  t,
  tQuotes,
  tShopping,
}: PersonalAiChatToolCardProps) {
  const partWithState = part as { type: string; state?: string; output?: Record<string, unknown> };
  const isToolPart = partWithState.type.startsWith("tool-") && partWithState.type !== "tool-invocation";
  if (!isToolPart || partWithState.state !== "output-available") return null;

  const result = partWithState.output;
  if (!result) return null;

  if (result.__emailPreview) {
    const emailData = result as unknown as EmailPreviewData & {
      __emailPreview: true;
      memberIds?: string[];
      attachments?: EmailAttachment[];
    };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<Mail className="size-5 text-primary" />}
        title={emailData.subject || t("emailPanel.title")}
        subtitle={emailData.recipients.slice(0, 2).join(", ") + (emailData.recipients.length > 2 ? ` +${emailData.recipients.length - 2}` : "")}
        buttonLabel={t("emailPanel.showEmail")}
        onOpen={() => {
          callbacks.setOpenSearchResults(null);
          callbacks.setOpenEmailPreviewData({
            type: emailData.type,
            recipients: emailData.recipients,
            recipientNames: emailData.recipientNames,
            subject: emailData.subject,
            body: emailData.body,
            replyTo: emailData.replyTo,
            attachments: emailData.attachments,
            previewHtml: emailData.previewHtml,
            projectId: emailData.projectId,
            projectName: emailData.projectName,
            memberIds: emailData.memberIds,
          });
        }}
      />
    );
  }

  if (result.__searchResults && Array.isArray(result.results)) {
    const searchResults = result.results as SearchResult[];
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<Search className="size-5 text-primary" />}
        title={`Hittade ${searchResults.length} dokument`}
        buttonLabel="Visa resultat"
        onOpen={() => {
          callbacks.setOpenEmailPreviewData(null);
          callbacks.setOpenSearchResults(searchResults);
        }}
      />
    );
  }

  if (result.__fileCreated) {
    const fileData = result as unknown as FileCreatedData & { __fileCreated: true };
    return (
      <FileCreatedCard
        key={toolCardKey}
        data={{
          fileId: fileData.fileId,
          fileName: fileData.fileName,
          fileType: fileData.fileType,
          fileSize: fileData.fileSize,
          downloadUrl: fileData.downloadUrl,
          previewUrl: fileData.previewUrl,
          message: fileData.message,
        }}
      />
    );
  }

  if (result.__reportPreview) {
    const reportData = result as unknown as ReportPreviewData & { __reportPreview: true };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<BarChart2 className="size-5 text-primary" />}
        title={`Rapport — ${reportData.title}`}
        subtitle={reportData.projectName}
        buttonLabel="Öppna rapport"
        onOpen={() =>
          callbacks.setOpenReportData({
            title: reportData.title,
            summary: reportData.summary,
            sections: reportData.sections,
            projectId: reportData.projectId,
            projectName: reportData.projectName,
            format: reportData.format,
          })
        }
      />
    );
  }

  if (result.__deleteConfirmation) {
    const deleteData = result as DeleteConfirmationData & {
      __deleteConfirmation: true;
      actionParams: Record<string, string>;
    };
    return (
      <DeleteConfirmationCard
        key={toolCardKey}
        data={{
          type: deleteData.type,
          items: deleteData.items,
          actionParams: deleteData.actionParams,
        }}
        onConfirm={() => callbacks.onDeleteConfirm(deleteData)}
      />
    );
  }

  if (result.__quotePreview) {
    const quoteData = result as unknown as QuotePreviewData & { __quotePreview: true };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<FileText className="size-5 text-primary" />}
        title={`Offert — ${quoteData.title}`}
        subtitle={quoteData.clientName}
        buttonLabel="Öppna offert"
        onOpen={() =>
          callbacks.setOpenQuoteData({
            projectId: quoteData.projectId,
            projectName: quoteData.projectName,
            clientName: quoteData.clientName,
            clientEmail: quoteData.clientEmail,
            title: quoteData.title,
            items: quoteData.items,
            validUntil: quoteData.validUntil,
            notes: quoteData.notes,
            includeRot: quoteData.includeRot,
          })
        }
      />
    );
  }

  if (result.__wholesalerSearch) {
    const wsData = result.__wholesalerSearch as {
      query: string;
      products: WholesalerProduct[];
      count: number;
    };
    return (
      <WholesalerSearchResultButton
        key={toolCardKey}
        query={wsData.query}
        count={wsData.count}
        onOpen={() => callbacks.openWholesalerPanel(wsData)}
      />
    );
  }

  if (result.__quoteList) {
    const raw = result.__quoteList as {
      quotes: Array<{
        id: string;
        quoteNumber: string;
        title: string;
        customerName: string | null;
        status: string;
        totalExVat: number;
        itemCount: number;
        projectId: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
      count: number;
    };
    const listData = { quotes: raw.quotes as SerializedQuote[], count: raw.count };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<FileText className="size-5 text-primary" />}
        title={tQuotes("foundQuotes", { count: listData.count })}
        buttonLabel={tQuotes("openList")}
        onOpen={() => callbacks.setOpenQuoteListData(listData)}
      />
    );
  }

  if (result.__noteList) {
    const noteData = result.__noteList as NoteListPanelData;
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<StickyNote className="size-5 text-primary" />}
        title={t("noteList.found", { count: noteData.count })}
        subtitle={noteData.projectName ?? (noteData.isPersonal ? t("noteList.personal") : undefined)}
        buttonLabel={t("noteList.open")}
        onOpen={() => callbacks.setOpenNoteListData(noteData)}
      />
    );
  }

  if (result.__timeEntryList) {
    const teData = result.__timeEntryList as { entries: unknown[]; count: number };
    const count = teData.count ?? teData.entries?.length ?? 0;
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<Clock className="size-5 text-primary" />}
        title={t("timeEntryListButton", { count })}
        buttonLabel={t("timeEntryListOpen")}
        onOpen={() => callbacks.setOpenTimeEntryPanel(true)}
      />
    );
  }

  if (result.__fileList) {
    const fileListData = result.__fileList as {
      files: FileListGridItem[];
      count: number;
      projectId?: string;
      projectName?: string;
    };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<FolderOpen className="size-5 text-primary" />}
        title={t("fileListPanel.foundFiles", { count: fileListData.count })}
        subtitle={fileListData.projectName}
        buttonLabel={t("fileListPanel.openButton")}
        onOpen={() => callbacks.setOpenFileListData(fileListData)}
      />
    );
  }

  if (result.__taskList) {
    const tlData = result.__taskList as {
      tasks: DashboardTask[];
      count: number;
      projectId?: string;
      projectName?: string;
    };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<ListTodo className="size-5 text-primary" />}
        title={t("taskList.found", { count: tlData.count })}
        buttonLabel={t("taskList.open")}
        onOpen={() =>
          callbacks.setOpenTaskListData({
            tasks: tlData.tasks,
            count: tlData.count,
            projectId: tlData.projectId,
            projectName: tlData.projectName,
          })
        }
      />
    );
  }

  if (result.__shoppingLists) {
    const slData = result.__shoppingLists as {
      lists: SerializedShoppingListItem[];
      count: number;
    };
    return (
      <ChatResultButton
        key={toolCardKey}
        icon={<List className="size-5 text-primary" />}
        title={tShopping("panelFoundLists", { count: slData.count })}
        buttonLabel={tShopping("openPanel")}
        onOpen={() =>
          callbacks.setOpenShoppingListsData({ lists: slData.lists, count: slData.count })
        }
      />
    );
  }

  return null;
}
