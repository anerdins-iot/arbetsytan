"use client";

import { Loader2, MessageCircle, Info, FolderPlus, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { ProjectContextCard } from "@/components/ai/project-context-card";
import { generateAgentActionLog } from "@/components/ai/personal-ai-chat-utils";
import {
  groupMessageParts,
  filterDeduplicatedToolGroups,
  getToolDedupeKey,
  type MessagePart,
} from "@/components/ai/personal-ai-chat-message-parts";
import {
  PersonalAiChatToolCard,
  type PersonalAiChatToolCardCallbacks,
} from "@/components/ai/personal-ai-chat-tool-card";
import { MODEL_OPTIONS } from "@/lib/ai/providers";
import type { DebugContext } from "@/components/ai/rag-debug-modal";
import type { DailyBriefing as DailyBriefingData } from "@/actions/briefing";
import type { ProjectContextResult } from "@/actions/project-context";
import type { AnalysisFileData } from "@/components/ai/personal-ai-chat-types";
import { cn } from "@/lib/utils";

/** Message shape from useChat (minimal for rendering). */
export type ChatMessage = {
  id?: string;
  role: string;
  parts?: Array<MessagePart>;
};

export type PersonalAiChatMessageListProps = {
  messages: ChatMessage[];
  chatImageMap: Map<number, string[]>;
  messageDebugContext: Map<string, DebugContext>;
  messageModels: Map<string, string>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  isLoadingMore: boolean;
  briefingData: DailyBriefingData | null;
  projectContext: ProjectContextResult | null;
  isLoadingContext: boolean;
  isLoadingBriefing: boolean;
  error: Error | undefined;
  t: (key: string, values?: Record<string, string | number>) => string;
  tQuotes: (key: string, values?: Record<string, string | number>) => string;
  tShopping: (key: string, values?: Record<string, string | number>) => string;
  getChatErrorKey: (error: Error | undefined) => string;
  toolCardCallbacks: PersonalAiChatToolCardCallbacks;
  setDebugModalMessageId: (id: string | null) => void;
  setAnalysisFile: (file: AnalysisFileData | null) => void;
};

export function PersonalAiChatMessageList({
  messages,
  chatImageMap,
  messageDebugContext,
  messageModels,
  scrollContainerRef,
  sentinelRef,
  messagesEndRef,
  onScroll,
  isLoadingMore,
  briefingData,
  projectContext,
  isLoadingContext,
  isLoadingBriefing,
  error,
  t,
  tQuotes,
  tShopping,
  getChatErrorKey,
  toolCardCallbacks,
  setDebugModalMessageId,
  setAnalysisFile,
}: PersonalAiChatMessageListProps) {
  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={onScroll}
    >
      <div ref={sentinelRef} className="h-0 shrink-0" aria-hidden="true" />

      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {briefingData && messages.length === 0 && (
        <DailyBriefing data={briefingData} />
      )}

      {projectContext && messages.length === 0 && !isLoadingContext && (
        <ProjectContextCard context={projectContext} />
      )}

      {messages.length === 0 &&
        !error &&
        !briefingData &&
        !isLoadingBriefing &&
        !projectContext &&
        !isLoadingContext && (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center text-muted-foreground">
            <MessageCircle className="mb-2 size-10 opacity-50" />
            <p className="text-sm">{t("placeholder")}</p>
          </div>
        )}

      <div className="space-y-4 p-4">
        {messages.map((message, messageIndex) => {
          const parts = message.parts ?? [];
          const groups = groupMessageParts(parts as MessagePart[]);
          const filteredGroups = filterDeduplicatedToolGroups(groups, message.role);
          const attachedImageFileIds =
            message.role === "user" ? chatImageMap.get(messageIndex) : undefined;

          return (
            <div
              key={message.id ?? `msg-${messageIndex}`}
              className={cn(
                "flex flex-col gap-1",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              {filteredGroups.map((group, groupIndex) => {
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
                const toolCardKey =
                  getToolDedupeKey(part) ?? `tool-${message.id ?? messageIndex}-${i}`;

                return (
                  <PersonalAiChatToolCard
                    key={toolCardKey}
                    part={part}
                    toolCardKey={toolCardKey}
                    callbacks={toolCardCallbacks}
                    t={t}
                    tQuotes={tQuotes}
                    tShopping={tShopping}
                  />
                );
              })}

              {message.role === "user" &&
                attachedImageFileIds &&
                attachedImageFileIds.length > 0 && (
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
                            setAnalysisFile({
                              id: fileId,
                              name: `image-${fileId.slice(0, 8)}`,
                              type: "image/jpeg",
                              url: "",
                              ocrText: null,
                              ocrLoading: true,
                            });
                            void (async () => {
                              try {
                                const res = await fetch(
                                  `/api/ai/upload/file-info?fileId=${fileId}`
                                );
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
                                // Silently fail
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

              {message.role === "assistant" && (() => {
                const actions = generateAgentActionLog(message.parts ?? [], t);
                if (actions.length === 0) return null;
                return (
                  <div className="mt-1 max-w-[85%] text-[11px] text-muted-foreground/70">
                    <span className="font-medium">{t("agentLog.prefix")}</span>{" "}
                    {actions.join(" · ")}
                  </div>
                );
              })()}

              {message.role === "assistant" &&
                message.id != null &&
                (messageDebugContext.has(message.id) || messageModels.has(message.id)) && (
                  <div className="flex items-center gap-1.5">
                    {messageModels.get(message.id) != null &&
                      (() => {
                        const mk = messageModels.get(message.id);
                        const option = MODEL_OPTIONS.find((m) => m.key === mk);
                        return (
                          <span className="text-[10px] text-muted-foreground/60 font-mono">
                            {option?.label ?? mk}
                          </span>
                        );
                      })()}
                    {messageDebugContext.has(message.id) && (
                      <button
                        type="button"
                        onClick={() => setDebugModalMessageId(message.id ?? null)}
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
  );
}
