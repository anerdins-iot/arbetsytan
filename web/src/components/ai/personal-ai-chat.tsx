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
  FolderPlus,
  PanelRightClose,
  Maximize2,
  Minimize2,
  Info,
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
import type { ConversationListItem, ConversationWithMessagesResult } from "@/actions/conversations";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { VoiceModeToggle, type VoiceMode } from "@/components/ai/voice-mode-toggle";
import { ProjectSelector } from "@/components/ai/project-selector";
import { ModelSelector } from "@/components/ai/model-selector";
import { type ProviderKey, MODEL_OPTIONS } from "@/lib/ai/providers";
import { EmailPreviewCard, type EmailPreviewData, type EmailAttachment } from "@/components/ai/email-preview-card";
import { FileCreatedCard, type FileCreatedData } from "@/components/ai/file-created-card";
import { ReportPreviewCard, type ReportPreviewData } from "@/components/ai/report-preview-card";
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
import { QuotePreviewCard, type QuotePreviewData } from "@/components/ai/quote-preview-card";
import { deleteFile } from "@/actions/files";
import { deleteTask } from "@/actions/tasks";
import { deleteComment } from "@/actions/comments";
import { deleteNote } from "@/actions/notes";
import { deletePersonalNote, deletePersonalFile } from "@/actions/personal";
import { deleteTimeEntry } from "@/actions/time-entries";
import { deleteAutomation } from "@/actions/automations";
import { deleteNoteCategory } from "@/actions/note-categories";
import { generateQuotePdf } from "@/actions/quotes";
import { OcrReviewDialog } from "@/components/ai/ocr-review-dialog";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS, type RealtimeFileEvent } from "@/lib/socket-events";
import { RagDebugModal, type DebugContext } from "@/components/ai/rag-debug-modal";
import { WholesalerSearchResultButton } from "@/components/ai/wholesaler-search-result-button";
import { WholesalerSearchPanel } from "@/components/wholesaler/wholesaler-search-panel";
import type { WholesalerProduct } from "@/lib/wholesaler-search";

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
  thumbnailUrl?: string;
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
  /** Initial voice mode when opening via voice CTA */
  initialVoiceMode?: VoiceMode;
};

const PANEL_WIDTH_STORAGE_KEY = "ay-ai-chat-panel-width";
const DEFAULT_PANEL_WIDTH = 384; // 96 * 4 = w-96
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;

export function PersonalAiChat({ open, onOpenChange, initialProjectId, mode = "sheet", initialVoiceMode }: PersonalAiChatProps) {
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
  const [wholesalerPanelOpen, setWholesalerPanelOpen] = useState(false);
  const [wholesalerSearchData, setWholesalerSearchData] = useState<{
    query: string;
    products: WholesalerProduct[];
    count: number;
  } | null>(null);
  const [messageDebugContext, setMessageDebugContext] = useState<Map<string, DebugContext>>(new Map());
  const [debugModalMessageId, setDebugModalMessageId] = useState<string | null>(null);
  const pendingDebugContextRef = useRef<DebugContext | null>(null);
  const [messageModels, setMessageModels] = useState<Map<string, string>>(new Map());
  const pendingModelKeyRef = useRef<string | null>(null);
  // Track which messages have attached images (messageIndex -> fileIds)
  const [chatImageMap, setChatImageMap] = useState<Map<number, string[]>>(new Map());
  // Pending image file IDs to be sent with the next message
  const pendingImageFileIdsRef = useRef<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    try {
      const stored = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
      return stored ? parseInt(stored, 10) : DEFAULT_PANEL_WIDTH;
    } catch {
      return DEFAULT_PANEL_WIDTH;
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Persist panel width to localStorage
  useEffect(() => {
    if (mode === "docked") {
      try {
        localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
      } catch {
        // Ignore storage errors
      }
    }
  }, [panelWidth, mode]);

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

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Close fullscreen on Escape key
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

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = resizeStartX.current - e.clientX; // Subtract because we're on the right side
      const newWidth = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + deltaX)
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Project selector state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string }>>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;

  // Model selector state
  const [selectedModel, setSelectedModel] = useState<ProviderKey>("CLAUDE_HAIKU");
  const selectedModelRef = useRef<ProviderKey>("CLAUDE_HAIKU");
  selectedModelRef.current = selectedModel;

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastScrollHeightRef = useRef<number>(0);

  // Sync activeProjectId with URL-based initialProjectId
  useEffect(() => {
    if (initialProjectId) {
      setActiveProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  // Voice mode state
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off");
  const [triggerConversationRecording, setTriggerConversationRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  // Apply initial voice mode when opening via voice CTA
  useEffect(() => {
    if (open && initialVoiceMode) {
      setVoiceMode(initialVoiceMode);
    }
  }, [open, initialVoiceMode]);
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

  // Associate pending debug context with assistant message once streaming finishes
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

  // Associate pending model key with the last assistant message once streaming finishes
  useEffect(() => {
    if (isLoading || !pendingModelKeyRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      const key = pendingModelKeyRef.current;
      pendingModelKeyRef.current = null;
      setMessageModels(prev => new Map(prev).set(lastMsg.id, key));
    }
  }, [isLoading, messages]);

  // Auto-speak assistant messages when voice mode includes TTS
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
    setNextCursor(null);
    setHasMore(false);
    setHistoryOpen(false);
    setUploadedFiles([]);
    setMessageDebugContext(new Map());
    setMessageModels(new Map());
    lastSpokenMessageIdRef.current = null;
  }, [setMessages]);

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
      setUploadedFiles([]);
      // Don't auto-speak when loading old conversations
      if (uiMessages.length > 0) {
        lastSpokenMessageIdRef.current = uiMessages[uiMessages.length - 1].id;
      }
    },
    [setMessages]
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

  // Adjust scroll position after loading more messages
  useEffect(() => {
    if (lastScrollHeightRef.current > 0 && scrollContainerRef.current && !isLoadingMore) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - lastScrollHeightRef.current;
      scrollContainerRef.current.scrollTop = scrollDiff;
      lastScrollHeightRef.current = 0;
    }
  }, [messages, isLoadingMore]);

  // Infinite scroll: load more when sentinel (top of list) becomes visible
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

  // Filuppladdning — chatMode: upload silently, show thumbnail, send via vision
  const uploadFile = useCallback(
    async (file: File) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isImage = file.type.startsWith("image/");
      const tempUrl = isImage ? URL.createObjectURL(file) : undefined;

      const uploadEntry: UploadedFile = {
        id: tempId,
        name: file.name,
        type: file.type,
        size: file.size,
        status: "uploading",
        thumbnailUrl: tempUrl,
      };

      setUploadedFiles((prev) => [...prev, uploadEntry]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("chatMode", "true");
        if (conversationId) {
          formData.append("conversationId", conversationId);
        }
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
                  thumbnailUrl: isImage ? (data.file.url ?? tempUrl) : undefined,
                }
              : f
          )
        );

        // Revoke temp blob URL if we got a real URL
        if (tempUrl && data.file.url) {
          URL.revokeObjectURL(tempUrl);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { ...f, status: "error" as const, error: errorMsg }
              : f
          )
        );
        if (tempUrl) URL.revokeObjectURL(tempUrl);
      }
    },
    [conversationId]
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

  const removeUploadedFile = useCallback((fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  // Handle interim transcript updates from Web Speech API
  const handleInterimTranscript = useCallback((text: string) => {
    setInterimTranscript(text);
  }, []);

  // Handle voice input - send message directly (auto-send mode)
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

  // Handle voice input - put text in input field (manual mode)
  const handleVoiceInputManual = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setInputValue((prev) => (prev ? `${prev} ${text}` : text));
      setInterimTranscript("");
    },
    []
  );

  // Handle push-to-talk one-off recording result
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
      // Remove the uploaded file that was just used in OCR review
      if (file.id) {
        setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
      }
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
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Minimize" : "Maximize"}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        {mode === "docked" && !isFullscreen && (
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
      {historyOpen && (
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noConversations")}
            </p>
          ) : (
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
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
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {/* Sentinel for infinite scroll (observer triggers load when visible near top) */}
        <div ref={sentinelRef} className="h-0 shrink-0" aria-hidden="true" />

        {/* Loading indicator when fetching older messages */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

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
          {messages.map((message, messageIndex) => {
            // Gruppera på varandra följande text-parts till en bubbla så att punktlistor
            // och långa svar inte blir en bubbla per rad/segment (AI SDK kan skicka flera text-parts per meddelande).
            const parts = message.parts ?? [];
            type TextGroup = { type: "text"; text: string };
            type ToolGroup = { type: "tool"; part: (typeof parts)[number]; index: number };
            const groups: Array<TextGroup | ToolGroup> = [];
            // Get attached image file IDs for this user message
            const attachedImageFileIds = message.role === "user" ? chatImageMap.get(messageIndex) : undefined;
            let textAcc: string[] = [];
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              if (part.type === "text") {
                textAcc.push((part as { text: string }).text);
              } else {
                if (textAcc.length > 0) {
                  groups.push({ type: "text", text: textAcc.join("") });
                  textAcc = [];
                }
                if (part.type.startsWith("tool-") && part.type !== "tool-invocation") {
                  groups.push({ type: "tool", part, index: i });
                }
              }
            }
            if (textAcc.length > 0) {
              groups.push({ type: "text", text: textAcc.join("") });
            }

            return (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              {groups.map((group, groupIndex) => {
                if (group.type === "text") {
                  return (
                    <div
                      key={groupIndex}
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <MarkdownMessage content={group.text} />
                    </div>
                  );
                }

                const part = group.part;
                const i = group.index;

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

                  if (result?.__fileCreated) {
                    const fileData = result as unknown as FileCreatedData & {
                      __fileCreated: true;
                    };

                    return (
                      <FileCreatedCard
                        key={i}
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

                  if (result?.__reportPreview) {
                    const reportData = result as unknown as ReportPreviewData & {
                      __reportPreview: true;
                    };

                    const handleReportGenerate = async (finalData: ReportPreviewData) => {
                      // Build content from sections
                      const contentParts: string[] = [];
                      for (const section of finalData.sections) {
                        contentParts.push(`## ${section.title}\n`);
                        if (section.type === "table" && section.data && section.data.length > 0) {
                          // Build markdown table
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

                      // Send a message to the AI to generate the document
                      sendMessage({
                        text: `Generera rapporten "${finalData.title}" som ${finalData.format.toUpperCase()}. ` +
                          `${finalData.projectId ? `Projekt-ID: ${finalData.projectId}. ` : ""}` +
                          `Innehåll:\n\n${finalData.summary}\n\n${fullContent}`,
                      });

                      return { success: true };
                    };

                    return (
                      <ReportPreviewCard
                        key={i}
                        data={{
                          title: reportData.title,
                          summary: reportData.summary,
                          sections: reportData.sections,
                          projectId: reportData.projectId,
                          projectName: reportData.projectName,
                          format: reportData.format,
                        }}
                        onGenerate={handleReportGenerate}
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

                  if (result?.__quotePreview) {
                    const quoteData = result as unknown as QuotePreviewData & {
                      __quotePreview: true;
                    };

                    const handleGenerate = async () => {
                      return generateQuotePdf({
                        projectId: quoteData.projectId,
                        projectName: quoteData.projectName,
                        clientName: quoteData.clientName,
                        clientEmail: quoteData.clientEmail,
                        title: quoteData.title,
                        items: quoteData.items,
                        validUntil: quoteData.validUntil,
                        notes: quoteData.notes,
                        includeRot: quoteData.includeRot,
                      });
                    };

                    return (
                      <QuotePreviewCard
                        key={i}
                        data={{
                          projectId: quoteData.projectId,
                          projectName: quoteData.projectName,
                          clientName: quoteData.clientName,
                          clientEmail: quoteData.clientEmail,
                          title: quoteData.title,
                          items: quoteData.items,
                          validUntil: quoteData.validUntil,
                          notes: quoteData.notes,
                          includeRot: quoteData.includeRot,
                        }}
                        onGenerate={handleGenerate}
                      />
                    );
                  }

                  if (result?.__wholesalerSearch) {
                    const wsData = result.__wholesalerSearch as {
                      query: string;
                      products: WholesalerProduct[];
                      count: number;
                    };

                    return (
                      <WholesalerSearchResultButton
                        key={i}
                        query={wsData.query}
                        count={wsData.count}
                        onOpen={() => {
                          setWholesalerSearchData(wsData);
                          setWholesalerPanelOpen(true);
                        }}
                      />
                    );
                  }
                }

                return null;
              })}
              {/* Attached image thumbnails for user messages */}
              {message.role === "user" && attachedImageFileIds && attachedImageFileIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-w-[85%]">
                  {attachedImageFileIds.map((fileId) => (
                    <div key={fileId} className="relative">
                      <div className="size-16 overflow-hidden rounded-md border border-primary-foreground/20">
                        <ImageIcon className="size-full p-3 text-primary-foreground/50" />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute -bottom-2 -right-2 size-6 rounded-full shadow-sm"
                        onClick={() => {
                          // Open OcrReviewDialog for this file
                          setAnalysisFile({
                            id: fileId,
                            name: `image-${fileId.slice(0, 8)}`,
                            type: "image/jpeg",
                            url: "",
                            ocrText: null,
                            ocrLoading: true,
                          });
                          // Fetch file details to populate the dialog
                          void (async () => {
                            try {
                              const res = await fetch(`/api/ai/upload/file-info?fileId=${fileId}`);
                              if (res.ok) {
                                const data = await res.json();
                                setAnalysisFile({
                                  id: fileId,
                                  name: data.name || `image-${fileId.slice(0, 8)}`,
                                  type: data.type || "image/jpeg",
                                  url: data.url || "",
                                  ocrText: data.ocrText ?? null,
                                  ocrLoading: false,
                                });
                              }
                            } catch {
                              // Silently fail — user can close dialog
                            }
                          })();
                        }}
                        title={t("saveToProject")}
                      >
                        <FolderPlus className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {/* RAG debug button and model badge for assistant messages */}
              {message.role === "assistant" && (messageDebugContext.has(message.id) || messageModels.has(message.id)) && (
                <div className="flex items-center gap-1.5">
                  {messageModels.get(message.id) && (() => {
                    const mk = messageModels.get(message.id)!;
                    const option = MODEL_OPTIONS.find(m => m.key === mk);
                    return (
                      <span className="text-[10px] text-muted-foreground/60 font-mono">
                        {option?.label ?? mk}
                      </span>
                    );
                  })()}
                  {messageDebugContext.has(message.id) && (
                    <button
                      type="button"
                      onClick={() => setDebugModalMessageId(message.id)}
                      className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                      title="Visa RAG-debug"
                    >
                      <Info className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Uppladdade filer — thumbnails för bilder, kompakt chip för dokument */}
      {uploadedFiles.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file) => {
              const isImage = file.type.startsWith("image/");
              if (isImage && file.thumbnailUrl) {
                return (
                  <div
                    key={file.id}
                    className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-border"
                  >
                    <img
                      src={file.thumbnailUrl}
                      alt={file.name}
                      className="size-full object-cover"
                    />
                    {(file.status === "uploading" || file.status === "analyzing") && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {file.status === "error" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
                        <X className="size-4 text-destructive" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeUploadedFile(file.id)}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-background p-0.5 shadow-sm group-hover:block"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              }
              return (
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
              );
            })}
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

      {/* Live interim transcript display */}
      {interimTranscript && (
        <div className="border-t border-border bg-muted/30 px-4 py-2">
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            {interimTranscript}
          </p>
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
          onPaste={handlePaste}
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
              voiceMode={voiceMode}
              onVoiceModeChange={setVoiceMode}
              onVoiceInput={handleVoiceInput}
              onVoiceInputManual={handleVoiceInputManual}
              onPushToTalkResult={handlePushToTalkResult}
              onInterimTranscript={handleInterimTranscript}
              speakRef={speakRef}
              stopRef={stopSpeakingRef}
              isSpeakingRef={isSpeakingRef}
              triggerConversationRecording={triggerConversationRecording}
              disabled={isLoading}
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
              disabled={!inputValue.trim() && !uploadedFiles.some((f) => f.status === "done" && f.type.startsWith("image/"))}
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

  // RAG debug modal
  const debugModalContext = debugModalMessageId ? messageDebugContext.get(debugModalMessageId) : undefined;
  const ragDebugUI = debugModalContext ? (
    <RagDebugModal
      open={!!debugModalMessageId}
      onClose={() => setDebugModalMessageId(null)}
      context={debugModalContext}
    />
  ) : null;

  // Wholesaler search panel — opened from WholesalerSearchResultButton in chat
  const wholesalerPanelUI = (
    <WholesalerSearchPanel
      open={wholesalerPanelOpen}
      onOpenChange={setWholesalerPanelOpen}
      initialQuery={wholesalerSearchData?.query}
      initialProducts={wholesalerSearchData?.products}
    />
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
    // Fullscreen mode - overlay everything
    if (isFullscreen) {
      return (
        <>
          <div className="fixed inset-0 z-50 flex flex-col bg-background/80 backdrop-blur-sm">
            <div className="flex h-full flex-col border border-border bg-card shadow-2xl m-4 rounded-lg overflow-hidden">
              {headerContent}
              {chatBody}
            </div>
          </div>
          {fileAnalysisUI}
          {ragDebugUI}
          {wholesalerPanelUI}
        </>
      );
    }

    // Regular docked mode with resizable panel
    return (
      <>
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
        {fileAnalysisUI}
        {ragDebugUI}
        {wholesalerPanelUI}
      </>
    );
  }

  // Sheet mode: render as overlay (default)
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

      {fileAnalysisUI}
      {ragDebugUI}
      {wholesalerPanelUI}
    </>
  );
}
