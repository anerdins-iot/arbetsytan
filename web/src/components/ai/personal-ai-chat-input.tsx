"use client";

import { Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceModeToggle, type VoiceMode } from "@/components/ai/voice-mode-toggle";
import type { UploadedFile } from "@/components/ai/personal-ai-chat-types";

export type PersonalAiChatInputProps = {
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit: (e?: { preventDefault?: () => void }) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  isLoading: boolean;
  uploadedFiles: UploadedFile[];
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  onVoiceInput: (text: string) => void;
  onVoiceInputManual: (text: string) => void;
  onPushToTalkResult: (text: string) => void;
  onInterimTranscript: (text: string) => void;
  speakRef: React.RefObject<((text: string) => Promise<void>) | null>;
  stopRef: React.RefObject<(() => void) | null>;
  isSpeakingRef: React.RefObject<boolean>;
  triggerConversationRecording: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (files: FileList | File[]) => void;
  stop: () => void;
  t: (key: string) => string;
};

export function PersonalAiChatInput({
  inputValue,
  onInputChange,
  onSubmit,
  onPaste,
  isLoading,
  uploadedFiles,
  voiceMode,
  setVoiceMode,
  onVoiceInput,
  onVoiceInputManual,
  onPushToTalkResult,
  onInterimTranscript,
  speakRef,
  stopRef,
  isSpeakingRef,
  triggerConversationRecording,
  fileInputRef,
  onFileSelect,
  stop,
  t,
}: PersonalAiChatInputProps) {
  const hasSendableContent =
    !!inputValue.trim() ||
    uploadedFiles.some((f) => f.status === "done" && f.type.startsWith("image/"));

  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 flex-col gap-2 border-t border-border p-3"
    >
      <Textarea
        value={inputValue}
        onChange={onInputChange}
        placeholder={t("placeholder")}
        rows={3}
        className="min-h-20 w-full resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !isLoading) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onPaste={onPaste}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFileSelect(e.target.files);
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

          <VoiceModeToggle
            voiceMode={voiceMode}
            onVoiceModeChange={setVoiceMode}
            onVoiceInput={onVoiceInput}
            onVoiceInputManual={onVoiceInputManual}
            onPushToTalkResult={onPushToTalkResult}
            onInterimTranscript={onInterimTranscript}
            speakRef={speakRef}
            stopRef={stopRef}
            isSpeakingRef={isSpeakingRef}
            triggerConversationRecording={triggerConversationRecording}
            disabled={isLoading}
          />
        </div>

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
            disabled={!hasSendableContent}
            aria-label={t("send")}
          >
            <Send className="size-4" />
            {t("send")}
          </Button>
        )}
      </div>
    </form>
  );
}
