"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  Square,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVoiceInput, type RecordingMode } from "@/hooks/useVoiceInput";
import { useSpeechSynthesis, type TTSProvider } from "@/hooks/useSpeechSynthesis";
import { cn } from "@/lib/utils";

type VoiceModeToggleProps = {
  /** Callback when voice input produces text */
  onVoiceInput: (text: string) => void;
  /** Whether voice mode is enabled */
  voiceModeEnabled: boolean;
  /** Toggle voice mode */
  onVoiceModeToggle: (enabled: boolean) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Current TTS provider */
  ttsProvider: TTSProvider;
  /** Set TTS provider */
  onTtsProviderChange: (provider: TTSProvider) => void;
  /** Speak text (used by parent to trigger TTS) */
  speakRef?: React.MutableRefObject<((text: string) => Promise<void>) | null>;
  /** Stop speaking (used by parent) */
  stopRef?: React.MutableRefObject<(() => void) | null>;
  /** Check if currently speaking */
  isSpeakingRef?: React.MutableRefObject<boolean>;
  /** Callback to notify parent about conversation mode changes */
  onConversationModeChange?: (enabled: boolean) => void;
  /** Trigger to start recording in conversation mode (after TTS ends) */
  triggerConversationRecording?: boolean;
};

export function VoiceModeToggle({
  onVoiceInput,
  voiceModeEnabled,
  onVoiceModeToggle,
  disabled = false,
  ttsProvider,
  onTtsProviderChange,
  speakRef,
  stopRef,
  isSpeakingRef,
  onConversationModeChange,
  triggerConversationRecording,
}: VoiceModeToggleProps) {
  const t = useTranslations("personalAi.voice");
  const [showSettings, setShowSettings] = useState(false);

  // Track click timing for double-click detection
  const lastClickTimeRef = useRef<number>(0);
  const clickCountRef = useRef<number>(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track if button is being held (for push-to-talk)
  const isHoldingRef = useRef<boolean>(false);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Voice input (STT)
  const {
    isRecording,
    isTranscribing,
    mode,
    startRecording,
    stopRecording,
    cancelRecording,
    exitConversationMode,
    isConversationMode,
    duration,
    audioLevel,
    error: sttError,
  } = useVoiceInput({
    language: "sv",
    onTranscript: (text) => {
      if (text.trim()) {
        onVoiceInput(text);
      }
    },
  });

  // Speech synthesis (TTS)
  const {
    isPlaying,
    isLoading: ttsLoading,
    speak,
    stop: stopSpeaking,
    provider,
    setProvider,
  } = useSpeechSynthesis({
    provider: ttsProvider,
  });

  // Expose speak/stop functions to parent via refs
  if (speakRef) speakRef.current = speak;
  if (stopRef) stopRef.current = stopSpeaking;
  if (isSpeakingRef) isSpeakingRef.current = isPlaying;

  // Notify parent about conversation mode changes
  useEffect(() => {
    onConversationModeChange?.(isConversationMode);
  }, [isConversationMode, onConversationModeChange]);

  // Auto-start recording in conversation mode when TTS ends
  useEffect(() => {
    if (
      triggerConversationRecording &&
      isConversationMode &&
      !isRecording &&
      !isTranscribing &&
      !isPlaying &&
      !ttsLoading &&
      voiceModeEnabled
    ) {
      // Small delay before starting to record again
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
    voiceModeEnabled,
    startRecording,
  ]);

  // Sync provider changes
  const handleProviderChange = useCallback(
    (newProvider: TTSProvider) => {
      setProvider(newProvider);
      onTtsProviderChange(newProvider);
    },
    [setProvider, onTtsProviderChange]
  );

  // Handle mouse down - start hold timer for push-to-talk
  const handleMouseDown = useCallback(() => {
    if (disabled || isTranscribing || !voiceModeEnabled) return;

    isHoldingRef.current = true;

    // Start hold detection timer (200ms = hold, less = click)
    holdTimeoutRef.current = setTimeout(async () => {
      if (isHoldingRef.current && !isRecording) {
        // User is holding - start push-to-talk
        await startRecording("push-to-talk");
      }
    }, 200);
  }, [disabled, isTranscribing, voiceModeEnabled, isRecording, startRecording]);

  // Handle mouse up - stop push-to-talk or handle click
  const handleMouseUp = useCallback(async () => {
    const wasHolding = isHoldingRef.current;
    isHoldingRef.current = false;

    // Clear hold timeout
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    // If recording in push-to-talk mode, stop and send
    if (isRecording && mode === "push-to-talk") {
      await stopRecording();
      return;
    }

    // If we were holding and recording started, don't process as click
    if (wasHolding && isRecording) {
      return;
    }
  }, [isRecording, mode, stopRecording]);

  // Handle click - single click or double click detection
  const handleClick = useCallback(async () => {
    if (disabled || isTranscribing || !voiceModeEnabled) return;

    // If already recording (not push-to-talk), stop it
    if (isRecording && mode !== "push-to-talk") {
      await stopRecording();
      return;
    }

    // Don't process click if we just did push-to-talk
    if (mode === "push-to-talk" && !isRecording) {
      // Reset mode for next interaction
      return;
    }

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;

    // Clear existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    // Check for double-click (within 300ms)
    if (timeSinceLastClick < 300) {
      clickCountRef.current += 1;

      if (clickCountRef.current >= 2) {
        // Double click - enter conversation mode
        clickCountRef.current = 0;
        await startRecording("conversation");
        return;
      }
    } else {
      clickCountRef.current = 1;
    }

    // Wait to see if it's a double click
    clickTimeoutRef.current = setTimeout(async () => {
      if (clickCountRef.current === 1) {
        // Single click - start single recording mode
        await startRecording("single");
      }
      clickCountRef.current = 0;
    }, 300);
  }, [
    disabled,
    isTranscribing,
    voiceModeEnabled,
    isRecording,
    mode,
    stopRecording,
    startRecording,
  ]);

  // Handle exiting conversation mode
  const handleExitConversationMode = useCallback(() => {
    exitConversationMode();
    if (isRecording) {
      cancelRecording();
    }
  }, [exitConversationMode, isRecording, cancelRecording]);

  // Format recording duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get mode indicator text
  const getModeText = () => {
    switch (mode) {
      case "push-to-talk":
        return t("pushToTalk");
      case "conversation":
        return t("conversationMode");
      default:
        return null;
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
            {getModeText() && (
              <span className="hidden text-destructive/70 sm:inline">({getModeText()})</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 text-destructive hover:bg-destructive/20"
              onClick={isConversationMode ? handleExitConversationMode : cancelRecording}
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

        {/* Conversation mode active indicator (when not recording) */}
        {isConversationMode && !isRecording && !isTranscribing && (
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
            <MessageSquare className="size-3" />
            <span className="hidden sm:inline">{t("conversationMode")}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 text-primary hover:bg-primary/20"
              onClick={handleExitConversationMode}
            >
              <Square className="size-3" />
            </Button>
          </div>
        )}

        {/* Microphone button with tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isRecording ? "destructive" : isConversationMode ? "default" : "ghost"}
              size="icon"
              className={cn(
                "shrink-0",
                isRecording && "animate-pulse",
                !voiceModeEnabled && "text-muted-foreground",
                isConversationMode && !isRecording && "bg-primary/20 text-primary"
              )}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchEnd={handleMouseUp}
              onClick={handleClick}
              disabled={disabled || isTranscribing || !voiceModeEnabled}
              aria-label={isRecording ? t("stopRecording") : t("startRecording")}
            >
              {isTranscribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-center">
            <p className="font-medium">{t("microphoneHelp")}</p>
            <p className="text-xs text-muted-foreground">{t("microphoneHelpDetails")}</p>
          </TooltipContent>
        </Tooltip>

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

        {/* Voice mode toggle with settings dropdown */}
        <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={voiceModeEnabled ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "shrink-0",
                voiceModeEnabled ? "text-primary" : "text-muted-foreground"
              )}
              disabled={disabled}
              aria-label={t("voiceSettings")}
            >
              <Volume2 className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{t("voiceSettings")}</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Voice mode toggle */}
            <DropdownMenuItem
              onClick={() => onVoiceModeToggle(!voiceModeEnabled)}
              className="flex items-center justify-between"
            >
              <span>{t("voiceMode")}</span>
              <span
                className={cn(
                  "text-xs",
                  voiceModeEnabled ? "text-primary" : "text-muted-foreground"
                )}
              >
                {voiceModeEnabled ? t("on") : t("off")}
              </span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("ttsProvider")}
            </DropdownMenuLabel>

            {/* OpenAI option */}
            <DropdownMenuItem
              onClick={() => handleProviderChange("openai")}
              className="flex items-center justify-between"
            >
              <span>OpenAI</span>
              {provider === "openai" && (
                <span className="size-2 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>

            {/* ElevenLabs option */}
            <DropdownMenuItem
              onClick={() => handleProviderChange("elevenlabs")}
              className="flex items-center justify-between"
            >
              <span>ElevenLabs</span>
              {provider === "elevenlabs" && (
                <span className="size-2 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>

            {/* Help section */}
            <DropdownMenuSeparator />
            <div className="px-2 py-2 text-xs text-muted-foreground">
              <p className="font-medium mb-1">{t("microphoneHelp")}</p>
              <ul className="space-y-0.5">
                <li>{t("holdToTalk")}</li>
                <li>{t("clickOnce")}</li>
                <li>{t("clickTwice")}</li>
              </ul>
            </div>

            {/* Error display */}
            {sttError && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-xs text-destructive">{sttError}</div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
