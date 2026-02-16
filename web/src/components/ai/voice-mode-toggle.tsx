"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Mic,
  Volume2,
  VolumeX,
  Loader2,
  Square,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { cn } from "@/lib/utils";

/**
 * Voice mode cycle:
 * off → tts-only → conversation-auto → conversation-manual → off
 */
export type VoiceMode = "off" | "tts-only" | "conversation-auto" | "conversation-manual";

const VOICE_MODE_ORDER: VoiceMode[] = [
  "off",
  "tts-only",
  "conversation-auto",
  "conversation-manual",
];

type VoiceModeToggleProps = {
  /** Current voice mode */
  voiceMode: VoiceMode;
  /** Callback when voice mode changes */
  onVoiceModeChange: (mode: VoiceMode) => void;
  /** Callback when voice input produces text (for auto-send modes) */
  onVoiceInput: (text: string) => void;
  /** Callback when voice input produces text that should NOT auto-send */
  onVoiceInputManual?: (text: string) => void;
  /** Speak text (used by parent to trigger TTS) */
  speakRef?: React.MutableRefObject<((text: string) => Promise<void>) | null>;
  /** Stop speaking (used by parent) */
  stopRef?: React.MutableRefObject<(() => void) | null>;
  /** Check if currently speaking */
  isSpeakingRef?: React.MutableRefObject<boolean>;
  /** Trigger to start recording after TTS ends */
  triggerConversationRecording?: boolean;
  /** Disabled state */
  disabled?: boolean;
};

export function VoiceModeToggle({
  voiceMode,
  onVoiceModeChange,
  onVoiceInput,
  onVoiceInputManual,
  speakRef,
  stopRef,
  isSpeakingRef,
  triggerConversationRecording,
  disabled = false,
}: VoiceModeToggleProps) {
  const t = useTranslations("personalAi.voice");

  const isConversationMode = voiceMode === "conversation-auto" || voiceMode === "conversation-manual";
  const isAutoSend = voiceMode === "conversation-auto";

  // Voice input (STT)
  const {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    cancelRecording,
    duration,
    audioLevel,
    error: sttError,
  } = useVoiceInput({
    language: "sv",
    onTranscript: (text) => {
      if (!text.trim()) return;
      if (isAutoSend) {
        onVoiceInput(text);
      } else {
        // conversation-manual: put text in input field, don't auto-send
        onVoiceInputManual?.(text);
      }
    },
  });

  // Speech synthesis (TTS)
  const {
    isPlaying,
    isLoading: ttsLoading,
    speak,
    stop: stopSpeaking,
  } = useSpeechSynthesis({
    provider: "openai",
  });

  // Expose speak/stop functions to parent via refs
  if (speakRef) speakRef.current = speak;
  if (stopRef) stopRef.current = stopSpeaking;
  if (isSpeakingRef) isSpeakingRef.current = isPlaying;

  // Auto-start recording in conversation modes when TTS ends
  useEffect(() => {
    if (
      triggerConversationRecording &&
      isConversationMode &&
      !isRecording &&
      !isTranscribing &&
      !isPlaying &&
      !ttsLoading
    ) {
      const timeout = setTimeout(() => {
        startRecording("conversation");
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [
    triggerConversationRecording,
    isConversationMode,
    isRecording,
    isTranscribing,
    isPlaying,
    ttsLoading,
    startRecording,
  ]);

  // Cycle to next voice mode
  const cycleMode = useCallback(() => {
    if (disabled) return;
    // If recording, stop first
    if (isRecording) {
      cancelRecording();
    }
    // Stop any playing audio
    stopSpeaking();

    const currentIndex = VOICE_MODE_ORDER.indexOf(voiceMode);
    const nextIndex = (currentIndex + 1) % VOICE_MODE_ORDER.length;
    onVoiceModeChange(VOICE_MODE_ORDER[nextIndex]);
  }, [disabled, voiceMode, onVoiceModeChange, isRecording, cancelRecording, stopSpeaking]);

  // Handle stop conversation
  const handleStopConversation = useCallback(() => {
    if (isRecording) {
      cancelRecording();
    }
  }, [isRecording, cancelRecording]);

  // Format recording duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get icon for the cycle button based on current mode
  const getModeIcon = () => {
    switch (voiceMode) {
      case "off":
        return <VolumeX className="size-4" />;
      case "tts-only":
        return <Volume2 className="size-4" />;
      case "conversation-auto":
        return <MessageSquare className="size-4" />;
      case "conversation-manual":
        return <Mic className="size-4" />;
    }
  };

  // Get color classes for the cycle button based on current mode
  const getModeButtonClasses = () => {
    switch (voiceMode) {
      case "off":
        return "text-muted-foreground";
      case "tts-only":
        return "bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 dark:text-blue-400";
      case "conversation-auto":
        return "bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400";
      case "conversation-manual":
        return "bg-orange-500/15 text-orange-600 hover:bg-orange-500/25 dark:text-orange-400";
    }
  };

  // Get tooltip text for current mode
  const getModeTooltip = () => {
    switch (voiceMode) {
      case "off":
        return t("modeOff");
      case "tts-only":
        return t("modeTtsOnly");
      case "conversation-auto":
        return t("modeConversationAuto");
      case "conversation-manual":
        return t("modeConversationManual");
    }
  };

  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-1">
        {/* Recording indicator with audio level */}
        {isRecording && (
          <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {/* Audio level indicator */}
            <div className="flex h-3 items-end gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-sm transition-all duration-75",
                    audioLevel > i * 20
                      ? "bg-destructive"
                      : "bg-destructive/30"
                  )}
                  style={{
                    height: `${Math.max(4, Math.min(12, 4 + (audioLevel > i * 20 ? (i + 1) * 2 : 0)))}px`,
                  }}
                />
              ))}
            </div>
            <span>{formatDuration(duration)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 text-destructive hover:bg-destructive/20"
              onClick={handleStopConversation}
            >
              <Square className="size-3" />
            </Button>
          </div>
        )}

        {/* Transcribing indicator */}
        {isTranscribing && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span className="hidden sm:inline">{t("transcribing")}</span>
          </div>
        )}

        {/* TTS status / stop button */}
        {(isPlaying || ttsLoading) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-primary"
            onClick={stopSpeaking}
            aria-label={t("stopSpeaking")}
          >
            {ttsLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <VolumeX className="size-4" />
            )}
          </Button>
        )}

        {/* Main cycle button - ONE button that cycles through all modes */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("shrink-0", getModeButtonClasses())}
              onClick={cycleMode}
              disabled={disabled}
              aria-label={getModeTooltip()}
            >
              {getModeIcon()}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-center">
            <p className="font-medium">{getModeTooltip()}</p>
            <p className="text-xs text-muted-foreground">{t("clickToCycle")}</p>
          </TooltipContent>
        </Tooltip>

        {/* Error display */}
        {sttError && (
          <span className="text-xs text-destructive">{sttError}</span>
        )}
      </div>
    </TooltipProvider>
  );
}
