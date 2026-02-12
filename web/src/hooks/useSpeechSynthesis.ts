"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type TTSProvider = "openai" | "elevenlabs";

type SpeechState = "idle" | "loading" | "playing";

type UseSpeechSynthesisOptions = {
  /** TTS provider to use */
  provider?: TTSProvider;
  /** Voice ID (provider-specific) */
  voice?: string;
  /** Auto-play when speak() is called */
  autoPlay?: boolean;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech ends */
  onEnd?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
};

type UseSpeechSynthesisReturn = {
  /** Current state */
  state: SpeechState;
  /** Whether audio is loading */
  isLoading: boolean;
  /** Whether audio is playing */
  isPlaying: boolean;
  /** Speak the given text */
  speak: (text: string) => Promise<void>;
  /** Stop current playback */
  stop: () => void;
  /** Pause current playback */
  pause: () => void;
  /** Resume paused playback */
  resume: () => void;
  /** Current TTS provider */
  provider: TTSProvider;
  /** Set TTS provider */
  setProvider: (provider: TTSProvider) => void;
  /** Last error */
  error: string | null;
};

export function useSpeechSynthesis(
  options: UseSpeechSynthesisOptions = {}
): UseSpeechSynthesisReturn {
  const {
    provider: initialProvider = "openai",
    voice,
    autoPlay = true,
    onStart,
    onEnd,
    onError,
  } = options;

  const [state, setState] = useState<SpeechState>("idle");
  const [provider, setProvider] = useState<TTSProvider>(initialProvider);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const speak = useCallback(
    async (text: string) => {
      // Skip empty text
      if (!text.trim()) return;

      setError(null);
      cleanup();
      setState("loading");

      try {
        const response = await fetch("/api/ai/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            provider,
            voice,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "TTS failed" }));
          throw new Error(data.error || "Failed to generate speech");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setState("playing");
          onStart?.();
        };

        audio.onended = () => {
          setState("idle");
          onEnd?.();
          cleanup();
        };

        audio.onerror = () => {
          const errorMsg = "Failed to play audio";
          setError(errorMsg);
          onError?.(errorMsg);
          setState("idle");
          cleanup();
        };

        if (autoPlay) {
          await audio.play();
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "TTS failed";
        setError(errorMsg);
        onError?.(errorMsg);
        setState("idle");
      }
    },
    [provider, voice, autoPlay, onStart, onEnd, onError, cleanup]
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState("idle");
    cleanup();
  }, [cleanup]);

  const pause = useCallback(() => {
    if (audioRef.current && state === "playing") {
      audioRef.current.pause();
      setState("idle");
    }
  }, [state]);

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused && audioRef.current.src) {
      audioRef.current.play().catch((err) => {
        const errorMsg = err instanceof Error ? err.message : "Failed to resume";
        setError(errorMsg);
        onError?.(errorMsg);
      });
    }
  }, [onError]);

  return {
    state,
    isLoading: state === "loading",
    isPlaying: state === "playing",
    speak,
    stop,
    pause,
    resume,
    provider,
    setProvider,
    error,
  };
}
