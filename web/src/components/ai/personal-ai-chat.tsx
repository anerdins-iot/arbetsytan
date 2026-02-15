"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  MessageCircle,
  History,
  Send,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  FolderOpen,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getPersonalConversations,
  getConversationWithMessages,
} from "@/actions/conversations";
import type { ConversationListItem } from "@/actions/conversations";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { VoiceModeToggle } from "@/components/ai/voice-mode-toggle";
import { ProjectSelector } from "@/components/ai/project-selector";
import { EmailPreviewCard, type EmailPreviewData, type EmailAttachment } from "@/components/ai/email-preview-card";
import { sendExternalEmail, sendToTeamMembers, type EmailAttachmentInput } from "@/actions/send-email";
import { getProjects } from "@/actions/projects";
import { getDailyBriefing } from "@/actions/briefing";
import type { DailyBriefing as DailyBriefingData } from "@/actions/briefing";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { getProjectContext } from "@/actions/project-context";
import type { ProjectContextResult } from "@/actions/project-context";
import { ProjectContextCard } from "@/components/ai/project-context-card";
import { SearchResultsCard, type SearchResult } from "@/components/ai/search-results-card";
import { DeleteConfirmationCard, type DeleteConfirmationData } from "@/components/ai/delete-confirmation-card";
import { deleteFile } from "@/actions/files";
import { deleteTask } from "@/actions/tasks";
import { deleteComment } from "@/actions/comments";
import { deleteNote } from "@/actions/notes";
import { deletePersonalNote, deletePersonalFile } from "@/actions/personal";
import { deleteTimeEntry } from "@/actions/time-entries";
import { deleteAutomation } from "@/actions/automations";
import { deleteNoteCategory } from "@/actions/note-categories";
import type { TTSProvider } from "@/hooks/useSpeechSynthesis";
import { OcrReviewDialog } from "@/components/ai/ocr-review-dialog";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS, type RealtimeFileEvent } from "@/lib/socket-events";

// Formatera datum för konversationshistorik
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Tillåtna filtyper
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp|docx|xlsx)$/i;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type UploadedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  status: "uploading" | "analyzing" | "done" | "error";
  error?: string;
  url?: string;
  ocrText?: string | null;
};

type AnalysisFileData = {
  id: string;
  name: string;
  type: string;
  url: string;
  ocrText?: string | null;
  ocrLoading?: boolean;
};

type PersonalAiChatProps = {
  /** Kontrollera om chattpanelen är öppen */
  open: boolean;
  /** Callback för att ändra öppet/stängt-tillstånd */
  onOpenChange: (open: boolean) => void;
  /** Projekt-ID från URL (synkas automatiskt) */
  initialProjectId?: string | null;
  /** Renderingsläge: sheet (overlay) eller docked (fast sidebar) */
  mode?: "sheet" | "docked";
};

export function PersonalAiChat({ open, onOpenChange, initialProjectId, mode = "sheet" }: PersonalAiChatProps) {
  const t = useTranslations("personalAi");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [briefingData, setBriefingData] = useState<DailyBriefingData | null>(null);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  const [projectContext, setProjectContext] = useState<ProjectContextResult | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [analysisFile, setAnalysisFile] = useState<AnalysisFileData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time file update via websocket
  const handleFileUpdated = useCallback((event: RealtimeFileEvent) => {
    setUploadedFiles((prev) =>
      prev.map((f) =>
        f.id === event.fileId
          ? {
              ...f,
              ocrText: event.ocrText ?? f.ocrText,
              url: event.url ?? f.url,
              status: "done" as const,
            }
          : f
      )
    );
  }, []);

  useSocketEvent(SOCKET_EVENTS.fileUpdated, handleFileUpdated);

  // Project selector state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string }>>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;

  // Sync activeProjectId with URL-based initialProjectId
  useEffect(() => {
    if (initialProjectId) {
      setActiveProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  // Voice mode state
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>("openai");
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [triggerConversationRecording, setTriggerConversationRecording] = useState(false);
  const speakRef = useRef<((text: string) => Promise<void>) | null>(null);
  const stopSpeakingRef = useRef<(() => void) | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpokenMessageIdRef = useRef<string | null>(null);

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
        ...(activeProjectIdRef.current ? { projectId: activeProjectIdRef.current } : {}),
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

  // Auto-speak assistant messages when voice mode is enabled
  useEffect(() => {
    if (!voiceModeEnabled || isLoading) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;
    if (lastMessage.id === lastSpokenMessageIdRef.current) return;

    // Get text content from message parts
    const textContent = (lastMessage.parts ?? [])
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join(" ");

    if (!textContent.trim()) return;

    // Mark as spoken and speak
    lastSpokenMessageIdRef.current = lastMessage.id;

    // Speak and trigger conversation recording when done
    const speakAndTrigger = async () => {
      await speakRef.current?.(textContent);
      // After TTS ends, trigger recording if in conversation mode
      if (isConversationMode) {
        setTriggerConversationRecording(true);
        // Reset trigger after a short delay
        setTimeout(() => setTriggerConversationRecording(false), 100);
      }
    };
    speakAndTrigger();
  }, [messages, voiceModeEnabled, isLoading, isConversationMode]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  // Load projects when chat opens
  useEffect(() => {
    if (!open) return;
    const loadProjects = async () => {
      const result = await getProjects();
      setProjectList(
        result.projects.map((p) => ({ id: p.id, name: p.name }))
      );
    };
    void loadProjects();
  }, [open]);

  // Load briefing when chat opens
  useEffect(() => {
    if (!open || briefingData) return;
    const loadBriefing = async () => {
      setIsLoadingBriefing(true);
      try {
        const data = await getDailyBriefing();
        setBriefingData(data);
      } catch {
        // Silently fail — briefing is non-critical
      } finally {
        setIsLoadingBriefing(false);
      }
    };
    void loadBriefing();
  }, [open, briefingData]);

  // Load project context when activeProjectId changes
  useEffect(() => {
    if (!activeProjectId) {
      setProjectContext(null);
      return;
    }
    const loadContext = async () => {
      setIsLoadingContext(true);
      try {
        const ctx = await getProjectContext(activeProjectId);
        setProjectContext(ctx);
      } catch {
        setProjectContext(null);
      } finally {
        setIsLoadingContext(false);
      }
    };
    void loadContext();
  }, [activeProjectId]);

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
    setUploadedFiles([]);
    lastSpokenMessageIdRef.current = null;
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
      setUploadedFiles([]);
      // Don't auto-speak when loading old conversations
      if (uiMessages.length > 0) {
        lastSpokenMessageIdRef.current = uiMessages[uiMessages.length - 1].id;
      }
    },
    [setMessages]
  );

  // Filuppladdning
  const uploadFile = useCallback(
    async (file: File) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const uploadEntry: UploadedFile = {
        id: tempId,
        name: file.name,
        type: file.type,
        size: file.size,
        status: "uploading",
      };

      setUploadedFiles((prev) => [...prev, uploadEntry]);

      // Open the dialog immediately with loading state for OCR
      // User can start writing description while OCR runs
      const tempUrl = URL.createObjectURL(file);
      setAnalysisFile({
        id: tempId,
        name: file.name,
        type: file.type,
        url: tempUrl,
        ocrText: null,
        ocrLoading: true,
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (conversationId) {
          formData.append("conversationId", conversationId);
        }
        // Always upload to project when project is selected
        if (activeProjectIdRef.current) {
          formData.append("projectId", activeProjectIdRef.current);
        }

        const res = await fetch("/api/ai/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  id: data.file.id,
                  status: "done" as const,
                  url: data.file.url,
                  ocrText: data.file.ocrText ?? null,
                }
              : f
          )
        );

        // Update the dialog with real file data and OCR result
        setAnalysisFile((prev) => {
          if (!prev || prev.id !== tempId) return prev;
          // Revoke the temporary blob URL
          URL.revokeObjectURL(tempUrl);
          return {
            id: data.file.id,
            name: file.name,
            type: file.type,
            url: data.file.url ?? "",
            ocrText: data.file.ocrText ?? null,
            ocrLoading: false,
          };
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { ...f, status: "error" as const, error: errorMsg }
              : f
          )
        );
        // Close dialog on error
        setAnalysisFile(null);
        URL.revokeObjectURL(tempUrl);
      }
    },
    [conversationId, sendMessage]
  );

  const handleFileSelect = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              name: file.name,
              type: file.type,
              size: file.size,
              status: "error",
              error: t("fileTooLarge"),
            },
          ]);
          continue;
        }
        if (!ALLOWED_EXTENSIONS.test(file.name)) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              name: file.name,
              type: file.type,
              size: file.size,
              status: "error",
              error: t("fileTypeNotAllowed"),
            },
          ]);
          continue;
        }
        void uploadFile(file);
      }
    },
    [uploadFile, t]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [handleFileSelect]
  );

  const removeUploadedFile = useCallback((fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  // Handle voice input - send message directly
  const handleVoiceInput = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;
      // Stop any current speech before sending new message
      stopSpeakingRef.current?.();
      sendMessage({ text });
    },
    [isLoading, sendMessage]
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const text = inputValue.trim();
      if (!text || isLoading) return;
      // Stop any current speech before sending new message
      stopSpeakingRef.current?.();
      sendMessage({ text });
      setInputValue("");
    },
    [inputValue, isLoading, sendMessage]
  );

  // Called when OCR review is complete - analysis runs in background
  const handleOcrReviewComplete = useCallback(
    (result: { ocrText: string; userDescription: string; skipped: boolean }) => {
      const file = analysisFile;
      if (!file) return;

      if (result.skipped) {
        // User skipped the review - just confirm upload
        sendMessage({
          text: `Jag har laddat upp filen "${file.name}".`,
        });
      } else {
        // Send context about the file to the AI
        const contextParts = [`Jag har laddat upp filen "${file.name}".`];
        if (result.userDescription) {
          contextParts.push(`\nMin beskrivning: ${result.userDescription}`);
        }
        if (result.ocrText) {
          // Truncate long OCR text
          const ocrPreview =
            result.ocrText.length > 500
              ? `${result.ocrText.slice(0, 500)}...`
              : result.ocrText;
          contextParts.push(`\nExtraherad text:\n${ocrPreview}`);
        }
        contextParts.push("\nAnalysen körs i bakgrunden.");
        sendMessage({ text: contextParts.join("") });
      }
      setAnalysisFile(null);
    },
    [analysisFile, sendMessage]
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Ikon baserat på filtyp
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <ImageIcon className="size-4 shrink-0" />;
    }
    return <FileText className="size-4 shrink-0" />;
  };

  // Header content shared by both modes
  const headerContent = (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 font-semibold">
        <MessageCircle className="size-5 text-muted-foreground" />
        {t("title")}
      </div>
      {mode === "docked" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => onOpenChange(false)}
        >
          <PanelRightClose className="size-4" />
        </Button>
      )}
    </div>
  );

  // Chat body content shared by both modes
  const chatBody = (
    <div
      className={cn(
        "flex flex-1 flex-col overflow-hidden",
        isDragOver && "ring-2 ring-primary ring-inset bg-primary/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Projekt-väljare och historik-bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <ProjectSelector
            projects={projectList}
            currentProjectId={activeProjectId}
            onSelect={setActiveProjectId}
            disabled={isLoading}
          />
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

      {/* Konversationshistorik-lista */}
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

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="flex items-center justify-center border-2 border-dashed border-primary bg-primary/5 px-4 py-6">
          <p className="text-sm font-medium text-primary">
            {t("dropFiles")}
          </p>
        </div>
      )}

      {/* Meddelandelista */}
      <div className="flex-1 overflow-y-auto">
        {/* Briefing */}
        {briefingData && messages.length === 0 && (
          <DailyBriefing data={briefingData} />
        )}

        {/* Project context */}
        {projectContext && messages.length === 0 && !isLoadingContext && (
          <ProjectContextCard context={projectContext} />
        )}

        {messages.length === 0 && !error && !briefingData && !isLoadingBriefing && !projectContext && !isLoadingContext && (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center text-muted-foreground">
            <MessageCircle className="mb-2 size-10 opacity-50" />
            <p className="text-sm">{t("placeholder")}</p>
          </div>
        )}
        <div className="space-y-4 p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              {/* Rendera message parts */}
              {(message.parts ?? []).map((part, i) => {
                // Text content
                if (part.type === "text") {
                  return (
                    <div
                      key={i}
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <MarkdownMessage content={part.text} />
                    </div>
                  );
                }

                // Tool invocations with email preview
                // AI SDK v6 uses "tool-{toolName}" as part.type, not "tool-invocation"
                const isToolPart = part.type.startsWith("tool-") && part.type !== "tool-invocation";
                if (isToolPart && (part as { state?: string }).state === "output-available") {
                  const result = (part as { output?: Record<string, unknown> }).output;
                  if (result?.__emailPreview) {
                    const emailData = result as unknown as EmailPreviewData & {
                      __emailPreview: true;
                      memberIds?: string[];
                      attachments?: EmailAttachment[];
                    };

                    // Convert EmailAttachment to EmailAttachmentInput for server action
                    const attachmentInputs: EmailAttachmentInput[] = (emailData.attachments ?? []).map((a) => ({
                      fileId: a.fileId,
                      fileName: a.fileName,
                      source: a.source,
                      projectId: a.projectId,
                    }));

                    const handleSend = async () => {
                      if (emailData.type === "external") {
                        const formData = new FormData();
                        formData.set("recipients", emailData.recipients.join(","));
                        formData.set("subject", emailData.subject);
                        formData.set("body", emailData.body);
                        if (emailData.replyTo) formData.set("replyTo", emailData.replyTo);
                        return sendExternalEmail(formData, attachmentInputs);
                      } else {
                        // Team email
                        return sendToTeamMembers(
                          emailData.memberIds ?? [],
                          emailData.subject,
                          emailData.body,
                          attachmentInputs
                        );
                      }
                    };

                    return (
                      <EmailPreviewCard
                        key={i}
                        data={{
                          type: emailData.type,
                          recipients: emailData.recipients,
                          subject: emailData.subject,
                          body: emailData.body,
                          replyTo: emailData.replyTo,
                          attachments: emailData.attachments,
                        }}
                        onSend={handleSend}
                      />
                    );
                  }

                  if (result?.__searchResults && Array.isArray(result.results)) {
                    return (
                      <SearchResultsCard
                        key={i}
                        results={result.results as SearchResult[]}
                      />
                    );
                  }

                  if (result?.__deleteConfirmation) {
                    const deleteData = result as DeleteConfirmationData & {
                      __deleteConfirmation: true;
                      actionParams: Record<string, string>;
                    };

                    const handleDeleteConfirm = async () => {
                      const { type, actionParams } = deleteData;
                      switch (type) {
                        case "file": {
                          const r = await deleteFile({
                            projectId: actionParams.projectId,
                            fileId: actionParams.fileId,
                          });
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "task": {
                          const r = await deleteTask(actionParams.projectId, {
                            taskId: actionParams.taskId,
                          });
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "comment": {
                          const r = await deleteComment(actionParams.projectId, {
                            commentId: actionParams.commentId,
                          });
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "projectNote": {
                          const r = await deleteNote(actionParams.projectId, actionParams.noteId);
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "personalNote": {
                          const r = await deletePersonalNote(actionParams.noteId);
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "personalFile": {
                          const r = await deletePersonalFile({ fileId: actionParams.fileId });
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "timeEntry": {
                          const r = await deleteTimeEntry(actionParams.timeEntryId);
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "automation": {
                          const r = await deleteAutomation(actionParams.automationId);
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        case "noteCategory": {
                          const r = await deleteNoteCategory(actionParams.categoryId);
                          return { success: r.success, error: r.success ? undefined : r.error };
                        }
                        default:
                          return { success: false, error: "Okänd raderingstyp" };
                      }
                    };

                    return (
                      <DeleteConfirmationCard
                        key={i}
                        data={{
                          type: deleteData.type,
                          items: deleteData.items,
                          actionParams: deleteData.actionParams,
                        }}
                        onConfirm={handleDeleteConfirm}
                      />
                    );
                  }
                }

                return null;
              })}
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Uppladdade filer */}
      {uploadedFiles.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                  file.status === "error"
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : file.status === "done"
                      ? "border-border bg-muted text-foreground"
                      : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {file.status === "uploading" || file.status === "analyzing" ? (
                  <Loader2 className="size-3.5 animate-spin shrink-0" />
                ) : (
                  getFileIcon(file.type)
                )}
                <span className="max-w-[120px] truncate">{file.name}</span>
                {file.status === "uploading" && (
                  <span className="text-muted-foreground">{t("uploading")}</span>
                )}
                {file.status === "analyzing" && (
                  <span className="text-muted-foreground">{t("analyzing")}</span>
                )}
                {file.error && (
                  <span className="text-destructive">{file.error}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeUploadedFile(file.id)}
                  className="ml-auto rounded p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Felmeddelande */}
      {error && (
        <div className="border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {t("error")}
        </div>
      )}

      {/* Aktiv projektindikator */}
      {activeProjectId && (
        <div className="flex items-center gap-1.5 border-t border-border bg-accent/50 px-4 py-1.5">
          <FolderOpen className="size-3.5 text-accent-foreground/70" />
          <span className="text-xs font-medium text-accent-foreground/70">
            {projectList.find((p) => p.id === activeProjectId)?.name}
          </span>
        </div>
      )}

      {/* Inmatningsfält */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-border p-3"
      >
        {/* Textarea - större och full bredd */}
        <Textarea
          value={inputValue}
          onChange={handleInputChange}
          placeholder={t("placeholder")}
          rows={3}
          className="min-h-20 w-full resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !isLoading) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        {/* Verktygsfält under textarea */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Gem-ikon för filuppladdning */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t("attachFile")}
              disabled={isLoading}
            >
              <Paperclip className="size-4" />
            </Button>

            {/* Voice mode controls */}
            <VoiceModeToggle
              onVoiceInput={handleVoiceInput}
              voiceModeEnabled={voiceModeEnabled}
              onVoiceModeToggle={setVoiceModeEnabled}
              disabled={isLoading}
              ttsProvider={ttsProvider}
              onTtsProviderChange={setTtsProvider}
              speakRef={speakRef}
              stopRef={stopSpeakingRef}
              isSpeakingRef={isSpeakingRef}
              onConversationModeChange={setIsConversationMode}
              triggerConversationRecording={triggerConversationRecording}
            />
          </div>

          {/* Skicka-knapp */}
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => stop()}
              aria-label={t("loading")}
            >
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("loading")}
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              className="gap-2"
              disabled={!inputValue.trim()}
              aria-label={t("send")}
            >
              <Send className="size-4" />
              {t("send")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );

  // OCR review dialog - simple review + save, analysis runs in background
  const fileAnalysisUI = analysisFile ? (
    <OcrReviewDialog
      open={!!analysisFile}
      onOpenChange={(open) => { if (!open) setAnalysisFile(null); }}
      file={analysisFile}
      onComplete={handleOcrReviewComplete}
    />
  ) : null;

  // Docked mode: render as a static sidebar panel
  if (mode === "docked") {
    return (
      <>
        <div className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-card">
          {headerContent}
          {chatBody}
        </div>
        {fileAnalysisUI}
      </>
    );
  }

  // Sheet mode: render as overlay (default)
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
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
          {chatBody}
        </SheetContent>
      </Sheet>
      {fileAnalysisUI}
    </>
  );
}
