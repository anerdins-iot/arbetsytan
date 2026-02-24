"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  MessageCircle,
  History,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getConversationWithMessages } from "@/actions/conversations";
import { cn } from "@/lib/utils";
import { type VoiceMode } from "@/components/ai/voice-mode-toggle";
import { PersonalAiChatInput } from "@/components/ai/personal-ai-chat-input";
import type { UploadedFile, AnalysisFileData, NoteListPanelData, PersonalAiChatProps } from "@/components/ai/personal-ai-chat-types";
import {
  LEFT_PANEL_COLLAPSED_KEY,
  CHAT_PANEL_COLLAPSED_KEY,
  LEFT_PANEL_WIDTH,
  STRIP_WIDTH,
} from "@/components/ai/personal-ai-chat-constants";
import { useChatFileUpload } from "@/hooks/use-chat-file-upload";
import { ChatUploadedFilesStrip } from "@/components/ai/chat-uploaded-files-strip";
import { usePersonalAiChatPanelResize } from "@/hooks/use-personal-ai-chat-panel-resize";
import {
  getChatErrorKey,
  formatConversationDate,
  generateAgentActionLog,
} from "@/components/ai/personal-ai-chat-utils";
import { useConversationHistory } from "@/hooks/use-conversation-history";
import { PersonalAiChatHistoryDropdown } from "@/components/ai/personal-ai-chat-history-dropdown";
import { PersonalAiChatMessageList } from "@/components/ai/personal-ai-chat-message-list";
import type { PersonalAiChatToolCardCallbacks } from "@/components/ai/personal-ai-chat-tool-card";
import {
  PersonalAiChatToolPanels,
  type ActiveToolPanel,
} from "@/components/ai/personal-ai-chat-tool-panels";
import type { PersonalAiChatPanelData, PersonalAiChatToolPanelContentCallbacks } from "@/components/ai/personal-ai-chat-tool-panel-content";
export type { NoteListPanelData } from "@/components/ai/personal-ai-chat-types";
import { ProjectSelector } from "@/components/ai/project-selector";
import { ModelSelector } from "@/components/ai/model-selector";
import { type ProviderKey, MODEL_OPTIONS } from "@/lib/ai/providers";
import type { EmailPreviewData } from "@/components/ai/email-preview-card";
import type { ReportPreviewData } from "@/components/ai/report-preview-card";
import { sendExternalEmail, sendToTeamMembers, type EmailAttachmentInput } from "@/actions/send-email";
import { getProjects } from "@/actions/projects";
import { getDailyBriefing } from "@/actions/briefing";
import type { DailyBriefing as DailyBriefingData } from "@/actions/briefing";
import { getProjectContext } from "@/actions/project-context";
import type { ProjectContextResult } from "@/actions/project-context";
import type { SearchResult } from "@/components/ai/search-results-card";
import type { QuotePreviewData } from "@/components/ai/quote-preview-card";
import type { SerializedQuote } from "@/components/quotes/quote-list";
import { deleteFile } from "@/actions/files";
import { deleteTask } from "@/actions/tasks";
import { deleteComment } from "@/actions/comments";
import { deleteNote } from "@/actions/notes";
import { deletePersonalNote, deletePersonalFile } from "@/actions/personal";
import { deleteTimeEntry, getMyTimeEntriesGrouped, type GroupedTimeEntries } from "@/actions/time-entries";
import { deleteAutomation } from "@/actions/automations";
import { deleteNoteCategory } from "@/actions/note-categories";
import { generateQuotePdf } from "@/actions/quotes";
import { getShoppingLists, type SerializedShoppingListItem } from "@/actions/shopping-list";
import { OcrReviewDialog } from "@/components/ai/ocr-review-dialog";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS, type RealtimeFileEvent } from "@/lib/socket-events";
import { RagDebugModal, type DebugContext } from "@/components/ai/rag-debug-modal";
import type { FileListGridItem } from "@/components/files/file-list-grid";
import { PersonalAiChatHeader } from "@/components/ai/personal-ai-chat-header";
import { useWholesalerPanel } from "@/contexts/wholesaler-panel-context";
import type { WholesalerProduct } from "@/lib/wholesaler-search";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getNoteCategories, type NoteCategoryItem } from "@/actions/note-categories";
import type { DashboardTask } from "@/actions/dashboard";

export function PersonalAiChat({ open, onOpenChange, initialProjectId, mode = "sheet", initialVoiceMode }: PersonalAiChatProps) {
  const t = useTranslations("personalAi");
  const tShopping = useTranslations("shoppingList");
  const tQuotes = useTranslations("quotes");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [briefingData, setBriefingData] = useState<DailyBriefingData | null>(null);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  const [projectContext, setProjectContext] = useState<ProjectContextResult | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [analysisFile, setAnalysisFile] = useState<AnalysisFileData | null>(null);
  const { openPanel: openWholesalerPanel } = useWholesalerPanel();
  const isDesktopToolPanel = useMediaQuery("(min-width: 1024px)");
  const [messageDebugContext, setMessageDebugContext] = useState<Map<string, DebugContext>>(new Map());
  const [debugModalMessageId, setDebugModalMessageId] = useState<string | null>(null);
  const pendingDebugContextRef = useRef<DebugContext | null>(null);
  const [messageModels, setMessageModels] = useState<Map<string, string>>(new Map());
  const pendingModelKeyRef = useRef<string | null>(null);
  const [openQuoteData, setOpenQuoteData] = useState<QuotePreviewData | null>(null);
  const [openSearchResults, setOpenSearchResults] = useState<SearchResult[] | null>(null);
  const [openReportData, setOpenReportData] = useState<ReportPreviewData | null>(null);
  const [openFileListData, setOpenFileListData] = useState<{
    files: FileListGridItem[];
    count: number;
    projectId?: string;
    projectName?: string;
  } | null>(null);
  const [openTaskListData, setOpenTaskListData] = useState<{
    tasks: DashboardTask[];
    count: number;
    projectId?: string;
    projectName?: string;
  } | null>(null);
  const [openShoppingListsData, setOpenShoppingListsData] = useState<{
    lists: SerializedShoppingListItem[];
    count: number;
  } | null>(null);
  const [openTimeEntryPanel, setOpenTimeEntryPanel] = useState(false);
  const [timeEntryPanelData, setTimeEntryPanelData] = useState<{
    groupedEntries: GroupedTimeEntries[];
    tasks: Array<{ id: string; title: string }>;
  } | null>(null);
  const [timeEntryPanelLoading, setTimeEntryPanelLoading] = useState(false);
  const [openQuoteListData, setOpenQuoteListData] = useState<{
    quotes: SerializedQuote[];
    count: number;
  } | null>(null);
  const [openNoteListData, setOpenNoteListData] = useState<NoteListPanelData | null>(null);
  const [noteListCategories, setNoteListCategories] = useState<NoteCategoryItem[]>([]);
  const [openEmailPreviewData, setOpenEmailPreviewData] = useState<(EmailPreviewData & { memberIds?: string[] }) | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(LEFT_PANEL_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [chatPanelCollapsed, setChatPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(CHAT_PANEL_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [chatImageMap, setChatImageMap] = useState<Map<number, string[]>>(new Map());
  const pendingImageFileIdsRef = useRef<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const scrollRafRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const { panelWidth, isResizing, handleResizeStart } = usePersonalAiChatPanelResize(mode);

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_PANEL_COLLAPSED_KEY, String(leftPanelCollapsed));
    } catch { /* ignore */ }
  }, [leftPanelCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_PANEL_COLLAPSED_KEY, String(chatPanelCollapsed));
    } catch { /* ignore */ }
  }, [chatPanelCollapsed]);

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

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string }>>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;

  const {
    uploadedFiles,
    setUploadedFiles,
    uploadFile,
    handleFileSelect,
    removeUploadedFile,
  } = useChatFileUpload(conversationId, activeProjectIdRef, t);

  const [selectedModel, setSelectedModel] = useState<ProviderKey>("GEMINI_FLASH");
  const selectedModelRef = useRef<ProviderKey>("GEMINI_FLASH");
  selectedModelRef.current = selectedModel;

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastScrollHeightRef = useRef<number>(0);

  useEffect(() => {
    if (initialProjectId) {
      setActiveProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off");
  const [triggerConversationRecording, setTriggerConversationRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  useEffect(() => {
    if (open && initialVoiceMode) {
      setVoiceMode(initialVoiceMode);
    }
  }, [open, initialVoiceMode]);
  const speakRef = useRef<((text: string) => Promise<void>) | null>(null);
  const stopSpeakingRef = useRef<(() => void) | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpokenMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight - container.clientHeight,
          behavior,
        });
      }
    });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
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
      body: () => {
        const imageFileIds = pendingImageFileIdsRef.current;
        pendingImageFileIdsRef.current = [];
        return {
          ...(conversationId ? { conversationId } : {}),
          ...(activeProjectIdRef.current ? { projectId: activeProjectIdRef.current } : {}),
          ...(imageFileIds.length > 0 ? { imageFileIds } : {}),
          provider: selectedModelRef.current,
        };
      },
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        const convId = res.headers.get("X-Conversation-Id");
        if (convId) setConversationId(convId);

        // Capture RAG debug context for the upcoming assistant message
        const debugCtx = res.headers.get("X-Debug-Context");
        if (debugCtx) {
          try {
            // Decode UTF-8 base64: atob() returns Latin-1, need TextDecoder for multibyte chars (å, ä, ö)
            const bytes = Uint8Array.from(atob(debugCtx), (c) => c.charCodeAt(0));
            const parsed: DebugContext = JSON.parse(new TextDecoder().decode(bytes));
            pendingDebugContextRef.current = parsed;
          } catch {
            // Ignore parse errors
          }
        }

        // Capture model key for the upcoming assistant message
        const modelKey = res.headers.get("X-Model-Key");
        if (modelKey) pendingModelKeyRef.current = modelKey;

        return res;
      },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const {
    conversations,
    loadingHistory,
    historyOpen,
    setHistoryOpen,
    loadConversation: loadConversationFromHistory,
    startNewConversation: startNewConversationFromHistory,
  } = useConversationHistory({
    setConversationId,
    setMessages,
    setNextCursor,
    setHasMore,
    onConversationLoaded: (lastMessageId) => {
      lastSpokenMessageIdRef.current = lastMessageId;
    },
  });

  useEffect(() => {
    if (isLoading || !pendingDebugContextRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      const ctx = pendingDebugContextRef.current;
      pendingDebugContextRef.current = null;
      setMessageDebugContext(prev => {
        const next = new Map(prev);
        next.set(lastMsg.id, ctx);
        return next;
      });
    }
  }, [isLoading, messages]);

  useEffect(() => {
    if (isLoading || !pendingModelKeyRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      const key = pendingModelKeyRef.current;
      pendingModelKeyRef.current = null;
      setMessageModels(prev => new Map(prev).set(lastMsg.id, key));
    }
  }, [isLoading, messages]);

  const ttsEnabled = voiceMode !== "off";
  const isConversationMode = voiceMode === "conversation-auto" || voiceMode === "conversation-manual";

  useEffect(() => {
    if (!ttsEnabled || isLoading) return;

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
  }, [messages, ttsEnabled, isLoading, isConversationMode]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

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

  useEffect(() => {
    if (!openNoteListData) return;
    getNoteCategories(null).then((r) => {
      if (r.success) setNoteListCategories(r.categories);
    });
  }, [openNoteListData]);

  useEffect(() => {
    if (!openTimeEntryPanel) return;
    setTimeEntryPanelLoading(true);
    getMyTimeEntriesGrouped()
      .then((r) => {
        if (r.success) setTimeEntryPanelData(r.data);
      })
      .finally(() => setTimeEntryPanelLoading(false));
  }, [openTimeEntryPanel]);

  const startNewConversation = useCallback(() => {
    startNewConversationFromHistory();
    setUploadedFiles([]);
    setMessageDebugContext(new Map());
    setMessageModels(new Map());
    lastSpokenMessageIdRef.current = null;
  }, [startNewConversationFromHistory]);

  const loadConversation = useCallback(
    async (convId: string) => {
      isInitialLoadRef.current = true;
      isNearBottomRef.current = true;
      await loadConversationFromHistory(convId);
      setUploadedFiles([]);
    },
    [loadConversationFromHistory]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!conversationId || !nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    // Store current scroll height to maintain position
    if (scrollContainerRef.current) {
      lastScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
    }

    const result = await getConversationWithMessages(conversationId, undefined, nextCursor);
    setIsLoadingMore(false);

    if (result.success) {
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      const olderMessages = result.messages.map((m) => ({
        id: m.id,
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        parts: [{ type: "text" as const, text: m.content }],
      }));
      setMessages((prev) => [...olderMessages, ...prev]);
    }
  }, [conversationId, nextCursor, isLoadingMore, setMessages]);

  useEffect(() => {
    if (lastScrollHeightRef.current > 0 && scrollContainerRef.current && !isLoadingMore) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - lastScrollHeightRef.current;
      scrollContainerRef.current.scrollTop = scrollDiff;
      lastScrollHeightRef.current = 0;
    }
  }, [messages, isLoadingMore]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!scrollContainer || !sentinel || !conversationId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        if (hasMore && !isLoadingMore) {
          void loadMoreMessages();
        }
      },
      { root: scrollContainer, rootMargin: "200px 0px 0px 0px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversationId, hasMore, isLoadingMore, loadMoreMessages]);

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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Bilder (screenshots)
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            // Ge filen ett namn med timestamp
            const namedFile = new File([file], `screenshot-${Date.now()}.png`, {
              type: file.type,
            });
            files.push(namedFile);
          }
        }
        // Filer
        else if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        handleFileSelect(files);
      }
    },
    [handleFileSelect]
  );

  const handleInterimTranscript = useCallback((text: string) => {
    setInterimTranscript(text);
  }, []);

  const handleVoiceInput = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;
      // Stop any current speech before sending new message
      stopSpeakingRef.current?.();
      sendMessage({ text });
      setInterimTranscript("");
    },
    [isLoading, sendMessage]
  );

  const handleVoiceInputManual = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setInputValue((prev) => (prev ? `${prev} ${text}` : text));
      setInterimTranscript("");
    },
    []
  );

  const handlePushToTalkResult = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (voiceMode === "conversation-auto") {
        // Auto-send mode: send directly
        if (!isLoading) {
          stopSpeakingRef.current?.();
          sendMessage({ text });
        }
      } else {
        // All other modes: put text in input field
        setInputValue((prev) => (prev ? `${prev} ${text}` : text));
      }
    },
    [voiceMode, isLoading, sendMessage]
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const text = inputValue.trim();
      // Allow sending with images even without text
      const imageFiles = uploadedFiles.filter(
        (f) => f.status === "done" && f.type.startsWith("image/")
      );
      const hasImages = imageFiles.length > 0;
      if ((!text && !hasImages) || isLoading) return;
      // Stop any current speech before sending new message
      stopSpeakingRef.current?.();

      // Collect image file IDs to send
      const imageFileIds = imageFiles.map((f) => f.id);
      if (imageFileIds.length > 0) {
        pendingImageFileIdsRef.current = imageFileIds;
      }

      // Track images for this message index (will be associated after send)
      if (hasImages) {
        const nextMsgIndex = messages.length;
        setChatImageMap((prev) => {
          const next = new Map(prev);
          next.set(nextMsgIndex, imageFiles.map((f) => f.id));
          return next;
        });
      }

      sendMessage({ text: text || " " });
      setInputValue("");
      setUploadedFiles([]);
    },
    [inputValue, isLoading, sendMessage, uploadedFiles, messages.length]
  );

  const handleReportGenerate = useCallback(async (finalData: ReportPreviewData) => {
    const contentParts: string[] = [];
    for (const section of finalData.sections) {
      contentParts.push(`## ${section.title}\n`);
      if (section.type === "table" && section.data && section.data.length > 0) {
        const headers = section.data[0];
        if (headers) {
          contentParts.push(`| ${headers.join(" | ")} |`);
          contentParts.push(`| ${headers.map(() => "---").join(" | ")} |`);
          for (const row of section.data.slice(1)) {
            contentParts.push(`| ${row.join(" | ")} |`);
          }
        }
        contentParts.push("");
      } else {
        contentParts.push(section.content);
        contentParts.push("");
      }
    }
    const fullContent = contentParts.join("\n");

    sendMessage({
      text: `Generera rapporten "${finalData.title}" som ${finalData.format.toUpperCase()}. ` +
        `${finalData.projectId ? `Projekt-ID: ${finalData.projectId}. ` : ""}` +
        `Innehåll:\n\n${finalData.summary}\n\n${fullContent}`,
    });

    return { success: true };
  }, [sendMessage]);

  const handleDeleteConfirm = useCallback(
    async (deleteData: { type: string; actionParams: Record<string, string> }) => {
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
    },
    []
  );

  const toolCardCallbacks: PersonalAiChatToolCardCallbacks = {
    setOpenQuoteData,
    setOpenSearchResults,
    setOpenReportData,
    setOpenEmailPreviewData,
    setOpenFileListData,
    setOpenTaskListData,
    setOpenShoppingListsData,
    setOpenTimeEntryPanel,
    setOpenQuoteListData,
    setOpenNoteListData,
    onReportGenerate: handleReportGenerate,
    onDeleteConfirm: handleDeleteConfirm,
    openWholesalerPanel,
  };

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
      // Remove the uploaded file that was just used in OCR review
      if (file.id) {
        setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
      }
    },
    [analysisFile, sendMessage]
  );

  useEffect(() => {
    // During streaming use instant scroll to avoid smooth-scroll fighting itself.
    // When loading an existing conversation use instant scroll (no animation).
    // When a new message arrives (not streaming) use smooth scroll.
    // Only scroll if the user is already near the bottom — don't hijack scroll position.
    if (isNearBottomRef.current) {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        scrollToBottom("instant");
      } else {
        scrollToBottom(isLoading ? "instant" : "smooth");
      }
    }
  }, [messages, isLoading, scrollToBottom]);

  const headerContent = (
    <PersonalAiChatHeader
      title={t("title")}
      isFullscreen={isFullscreen}
      onToggleFullscreen={toggleFullscreen}
      onClose={mode === "docked" && !isFullscreen ? () => onOpenChange(false) : undefined}
      mode={mode}
      closeButtonAriaLabel={t("strip.collapseChat")}
    />
  );

  const chatBody = (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isDragOver && "ring-2 ring-primary ring-inset bg-primary/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Projekt-väljare och historik-bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex min-w-0 shrink items-center gap-2 overflow-hidden">
          <ProjectSelector
            projects={projectList}
            currentProjectId={activeProjectId}
            onSelect={setActiveProjectId}
            disabled={isLoading}
          />
          <ModelSelector
            currentModel={selectedModel}
            onSelect={setSelectedModel}
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
      <PersonalAiChatHistoryDropdown
        open={historyOpen}
        loading={loadingHistory}
        conversations={conversations}
        selectedConversationId={conversationId}
        onSelect={loadConversation}
        onNewConversation={startNewConversation}
        t={t}
        formatDate={formatConversationDate}
      />

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="flex items-center justify-center border-2 border-dashed border-primary bg-primary/5 px-4 py-6">
          <p className="text-sm font-medium text-primary">
            {t("dropFiles")}
          </p>
        </div>
      )}

      {/* Meddelandelista */}
      <PersonalAiChatMessageList
        messages={messages}
        chatImageMap={chatImageMap}
        messageDebugContext={messageDebugContext}
        messageModels={messageModels}
        scrollContainerRef={scrollContainerRef}
        sentinelRef={sentinelRef}
        messagesEndRef={messagesEndRef}
        onScroll={handleScroll}
        isLoadingMore={isLoadingMore}
        briefingData={briefingData}
        projectContext={projectContext}
        isLoadingContext={isLoadingContext}
        isLoadingBriefing={isLoadingBriefing}
        error={error}
        t={t}
        tQuotes={tQuotes}
        tShopping={tShopping}
        getChatErrorKey={getChatErrorKey}
        toolCardCallbacks={toolCardCallbacks}
        setDebugModalMessageId={setDebugModalMessageId}
        setAnalysisFile={setAnalysisFile}
      />

      {/* Uppladdade filer — thumbnails för bilder, kompakt chip för dokument */}
      <ChatUploadedFilesStrip
        files={uploadedFiles}
        onRemove={removeUploadedFile}
        t={t}
      />

      {/* Felmeddelande */}
      {error && (
        <div className="border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {t(getChatErrorKey(error))}
        </div>
      )}

      {/* Aktiv projektindikator (shrink-0 så den inte klipps; truncate på namn) */}
      {activeProjectId && (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border bg-accent/50 px-4 py-1.5 min-h-[44px]">
          <FolderOpen className="size-3.5 shrink-0 text-accent-foreground/70" />
          <span className="min-w-0 truncate text-xs font-medium text-accent-foreground/70">
            {projectList.find((p) => p.id === activeProjectId)?.name}
          </span>
        </div>
      )}

      {/* Live interim transcript display */}
      {interimTranscript && (
        <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2">
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            {interimTranscript}
          </p>
        </div>
      )}

      {/* Inmatningsfält (shrink-0 så det alltid syns) */}
      <PersonalAiChatInput
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        isLoading={isLoading}
        uploadedFiles={uploadedFiles}
        voiceMode={voiceMode}
        setVoiceMode={setVoiceMode}
        onVoiceInput={handleVoiceInput}
        onVoiceInputManual={handleVoiceInputManual}
        onPushToTalkResult={handlePushToTalkResult}
        onInterimTranscript={handleInterimTranscript}
        speakRef={speakRef}
        stopRef={stopSpeakingRef}
        isSpeakingRef={isSpeakingRef}
        triggerConversationRecording={triggerConversationRecording}
        fileInputRef={fileInputRef}
        onFileSelect={handleFileSelect}
        stop={stop}
        t={t}
      />
    </div>
  );

  const debugModalContext = debugModalMessageId ? messageDebugContext.get(debugModalMessageId) : undefined;
  const ragDebugUI = debugModalContext ? (
    <RagDebugModal
      open={!!debugModalMessageId}
      onClose={() => setDebugModalMessageId(null)}
      context={debugModalContext}
    />
  ) : null;

  const activeToolPanel: ActiveToolPanel = openEmailPreviewData
    ? { type: "email", title: t("emailPanel.title") }
    : openQuoteData
    ? { type: "quote", title: "Offert" }
    : openSearchResults
      ? { type: "search", title: "Sökresultat" }
      : openReportData
        ? { type: "report", title: "Rapport" }
        : openQuoteListData
          ? { type: "quoteList", title: tQuotes("title") }
          : openNoteListData
            ? { type: "noteList", title: openNoteListData.projectName ?? (openNoteListData.isPersonal ? t("noteList.titlePersonal") : t("noteList.title")) }
            : openTimeEntryPanel
              ? { type: "timeEntry", title: t("timeEntryListSheetTitle") }
              : openFileListData
                ? { type: "fileList", title: t("fileListPanel.title") }
                : openTaskListData
                  ? { type: "taskList", title: t("taskList.sheetTitle") }
                  : openShoppingListsData
                    ? { type: "shoppingList", title: tShopping("title") }
                    : null;

  const closeActiveToolPanel = useCallback(() => {
    setOpenQuoteData(null);
    setOpenSearchResults(null);
    setOpenReportData(null);
    setOpenQuoteListData(null);
    setOpenNoteListData(null);
    setOpenTimeEntryPanel(false);
    setOpenFileListData(null);
    setOpenTaskListData(null);
    setOpenShoppingListsData(null);
    setOpenEmailPreviewData(null);
  }, []);

  const panelData: PersonalAiChatPanelData | null = activeToolPanel
    ? (() => {
        switch (activeToolPanel.type) {
          case "email":
            return openEmailPreviewData;
          case "quote":
            return openQuoteData;
          case "search":
            return openSearchResults;
          case "report":
            return openReportData;
          case "quoteList":
            return openQuoteListData;
          case "noteList":
            return openNoteListData;
          case "timeEntry":
            return timeEntryPanelData;
          case "fileList":
            return openFileListData;
          case "taskList":
            return openTaskListData;
          case "shoppingList":
            return openShoppingListsData;
          default:
            return null;
        }
      })()
    : null;

  const toolPanelCallbacks: PersonalAiChatToolPanelContentCallbacks = {
    onReportGenerate: handleReportGenerate,
    generateQuotePdf: async (data) => generateQuotePdf({ ...data }),
    onEmailSend: async (data) => {
      const attachmentInputs: EmailAttachmentInput[] = (data.attachments ?? []).map((a) => ({
        fileId: a.fileId,
        fileName: a.fileName,
        source: a.source,
        projectId: a.projectId,
      }));
      if (data.type === "external") {
        const formData = new FormData();
        formData.set("recipients", data.recipients.join(","));
        formData.set("subject", data.subject);
        formData.set("body", data.body);
        if (data.replyTo) formData.set("replyTo", data.replyTo);
        return sendExternalEmail(formData, attachmentInputs);
      }
      return sendToTeamMembers(
        data.memberIds ?? [],
        data.subject,
        data.body,
        attachmentInputs
      );
    },
    onEmailCancel: () => setOpenEmailPreviewData(null),
    onShoppingListsRefresh: async () => {
      const r = await getShoppingLists();
      if (r.success) setOpenShoppingListsData({ lists: r.lists, count: r.lists.length });
    },
  };

  const fileAnalysisUI = analysisFile ? (
    <OcrReviewDialog
      open={!!analysisFile}
      onOpenChange={(open) => { if (!open) setAnalysisFile(null); }}
      file={analysisFile}
      onComplete={handleOcrReviewComplete}
    />
  ) : null;

  if (mode === "docked") {
    if (isFullscreen) {
      return (
        <>
          <div className="fixed inset-0 z-50 flex flex-col bg-background/80 backdrop-blur-sm">
            <div className="flex h-full flex-col border border-border bg-card shadow-2xl m-4 rounded-lg overflow-hidden">
              {headerContent}
              {chatBody}
            </div>
          </div>
          {(mode === "sheet" || isFullscreen) && (
            <PersonalAiChatToolPanels
              activeToolPanel={activeToolPanel}
              panelData={panelData}
              mode="sheet"
              isDesktopToolPanel={isDesktopToolPanel}
              noteListCategories={noteListCategories}
              timeEntryPanelLoading={timeEntryPanelLoading}
              timeEntryPanelData={timeEntryPanelData}
              onClose={closeActiveToolPanel}
              t={t}
              tQuotes={tQuotes}
              tShopping={tShopping}
              callbacks={toolPanelCallbacks}
            />
          )}
          {fileAnalysisUI}
          {ragDebugUI}
        </>
      );
    }

    if (!open) {
      return (
        <div
          className="flex h-full shrink-0 flex-col items-center justify-center border-l border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
          style={{ width: `${STRIP_WIDTH}px` }}
          onClick={() => onOpenChange(true)}
          title={t("strip.openChat")}
        >
          <MessageCircle className="size-5 text-muted-foreground" />
          <ChevronLeft className="size-4 text-muted-foreground mt-1" />
        </div>
      );
    }

    if (chatPanelCollapsed) {
      return (
        <>
          <div className="flex h-full shrink-0">
            {/* Left panel (search/email) — visible when content exists */}
            {activeToolPanel && (
              leftPanelCollapsed ? (
                <div
                  className="flex h-full shrink-0 flex-col items-center justify-center border-l border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ width: `${STRIP_WIDTH}px` }}
                  onClick={() => setLeftPanelCollapsed(false)}
                  title={t("strip.expandPanel")}
                >
                  <ChevronRight className="size-4 text-muted-foreground" />
                  <span className="mt-1 text-[10px] text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                    {activeToolPanel.title}
                  </span>
                </div>
              ) : (
                <div className="flex h-full shrink-0 flex-col border-l border-border bg-card" style={{ width: `${LEFT_PANEL_WIDTH}px` }}>
                  <PersonalAiChatToolPanels
                    activeToolPanel={activeToolPanel}
                    panelData={panelData}
                    mode="docked"
                    isDesktopToolPanel={isDesktopToolPanel}
                    noteListCategories={noteListCategories}
                    timeEntryPanelLoading={timeEntryPanelLoading}
                    timeEntryPanelData={timeEntryPanelData}
                    onClose={closeActiveToolPanel}
                    onCollapsePanel={() => setLeftPanelCollapsed(true)}
                    t={t}
                    tQuotes={tQuotes}
                    tShopping={tShopping}
                    callbacks={toolPanelCallbacks}
                  />
                </div>
              )
            )}
            {/* Chat strip */}
            <div
              className="flex h-full shrink-0 flex-col items-center justify-center border-l border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
              style={{ width: `${STRIP_WIDTH}px` }}
              onClick={() => setChatPanelCollapsed(false)}
              title={t("strip.openChat")}
            >
              <MessageCircle className="size-5 text-muted-foreground" />
              <ChevronLeft className="size-4 text-muted-foreground mt-1" />
            </div>
          </div>
          {fileAnalysisUI}
          {ragDebugUI}
        </>
      );
    }

    return (
      <>
        <div className="flex h-full shrink-0">
          {/* Left panel (search/email) — visible when content exists */}
          {activeToolPanel && (
            leftPanelCollapsed ? (
              <div
                className="flex h-full shrink-0 flex-col items-center justify-center border-l border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                style={{ width: `${STRIP_WIDTH}px` }}
                onClick={() => setLeftPanelCollapsed(false)}
                title={t("strip.expandPanel")}
              >
                <ChevronRight className="size-4 text-muted-foreground" />
                <span className="mt-1 text-[10px] text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                  {activeToolPanel.title}
                </span>
              </div>
            ) : (
              <div className="flex h-full shrink-0 flex-col border-l border-border bg-card" style={{ width: `${LEFT_PANEL_WIDTH}px` }}>
                <PersonalAiChatToolPanels
                  activeToolPanel={activeToolPanel}
                  panelData={panelData}
                  mode="docked"
                  isDesktopToolPanel={isDesktopToolPanel}
                  noteListCategories={noteListCategories}
                  timeEntryPanelLoading={timeEntryPanelLoading}
                  timeEntryPanelData={timeEntryPanelData}
                  onClose={closeActiveToolPanel}
                  onCollapsePanel={() => setLeftPanelCollapsed(true)}
                  t={t}
                  tQuotes={tQuotes}
                  tShopping={tShopping}
                  callbacks={toolPanelCallbacks}
                />
              </div>
            )
          )}
          {/* Chat column */}
          <div
            className="relative flex h-full shrink-0 flex-col border-l border-border bg-card"
            style={{ width: `${panelWidth}px` }}
          >
            {/* Resize handle */}
            <div
              className={cn(
                "absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/50",
                isResizing && "bg-primary"
              )}
              onMouseDown={handleResizeStart}
            />
            {headerContent}
            {chatBody}
          </div>
        </div>
        {fileAnalysisUI}
        {ragDebugUI}
      </>
    );
  }

  return (
    <>
      {/* Fullscreen mode - overlay everything */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/80 backdrop-blur-sm">
          <div className="flex h-full flex-col border border-border bg-card shadow-2xl m-4 rounded-lg overflow-hidden">
            {headerContent}
            {chatBody}
          </div>
        </div>
      )}

      {/* Regular sheet mode */}
      {!isFullscreen && (
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
      )}

      {(mode === "sheet" || isFullscreen) && (
            <PersonalAiChatToolPanels
              activeToolPanel={activeToolPanel}
              panelData={panelData}
              mode="sheet"
              isDesktopToolPanel={isDesktopToolPanel}
              noteListCategories={noteListCategories}
              timeEntryPanelLoading={timeEntryPanelLoading}
              timeEntryPanelData={timeEntryPanelData}
              onClose={closeActiveToolPanel}
              t={t}
              tQuotes={tQuotes}
              tShopping={tShopping}
              callbacks={toolPanelCallbacks}
            />
          )}
      {fileAnalysisUI}
      {ragDebugUI}
    </>
  );
}
