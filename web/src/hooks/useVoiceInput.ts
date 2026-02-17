"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type VoiceInputState = "idle" | "recording" | "transcribing";

/**
 * Recording mode determines how voice input behaves:
 * - push-to-talk: Hold button to record, release to send
 * - single: Click to start, auto-stops on silence, sends automatically
 * - conversation: Continuous mode - after AI responds, auto-starts recording again
 */
export type RecordingMode = "push-to-talk" | "single" | "conversation";

type UseVoiceInputOptions = {
  /** Language for transcription (default: "sv" for Swedish) */
  language?: string;
  /** Callback when transcription is complete */
  onTranscript?: (text: string) => void;
  /** Callback for interim (partial) transcription while recording */
  onInterimTranscript?: (text: string) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Silence detection threshold in dB (default: -45) */
  silenceThreshold?: number;
  /** How long silence before auto-stop in ms (default: 1500) */
  silenceDuration?: number;
};

type UseVoiceInputReturn = {
  /** Current state of voice input */
  state: VoiceInputState;
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether currently transcribing */
  isTranscribing: boolean;
  /** Current recording mode */
  mode: RecordingMode;
  /** Start recording with specified mode */
  startRecording: (mode?: RecordingMode) => Promise<void>;
  /** Stop recording and transcribe */
  stopRecording: () => Promise<string | null>;
  /** Cancel recording without transcribing */
  cancelRecording: () => void;
  /** Set recording mode */
  setMode: (mode: RecordingMode) => void;
  /** Exit conversation mode */
  exitConversationMode: () => void;
  /** Whether in conversation mode */
  isConversationMode: boolean;
  /** Last error message */
  error: string | null;
  /** Recording duration in seconds */
  duration: number;
  /** Current audio level (0-100) for visualization */
  audioLevel: number;
  /** Current interim (partial) transcript from Web Speech API */
  interimTranscript: string;
};

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    language = "sv",
    onTranscript,
    onInterimTranscript,
    onError,
    silenceThreshold = -45,
    silenceDuration = 1500,
  } = options;

  const [state, setState] = useState<VoiceInputState>("idle");
  const [mode, setMode] = useState<RecordingMode>("single");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentModeRef = useRef<RecordingMode>("single");
  const speechRecognitionRef = useRef<any>(null); // Web Speech API - type dynamically from window
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  onInterimTranscriptRef.current = onInterimTranscript;

  // Keep mode ref in sync
  useEffect(() => {
    currentModeRef.current = mode;
  }, [mode]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.abort(); } catch { /* ignore */ }
      speechRecognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    silenceStartRef.current = null;
    setAudioLevel(0);
    setInterimTranscript("");
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob, mimeType: string): Promise<string | null> => {
    setState("transcribing");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${getExtensionFromMimeType(mimeType)}`);
      formData.append("language", language);

      const response = await fetch("/api/ai/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Transcription failed" }));
        throw new Error(data.error || "Transcription failed");
      }

      const data = await response.json();
      return data.text;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Transcription failed";
      setError(errorMsg);
      onError?.(errorMsg);
      return null;
    }
  }, [language, onError]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!mediaRecorderRef.current || state !== "recording") {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      const mimeType = mediaRecorder.mimeType;

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Clean up recording resources but keep conversation mode state
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (speechRecognitionRef.current) {
          try { speechRecognitionRef.current.abort(); } catch { /* ignore */ }
          speechRecognitionRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        silenceStartRef.current = null;
        setAudioLevel(0);
        setInterimTranscript("");

        const transcript = await transcribeAudio(audioBlob, mimeType);

        if (transcript) {
          onTranscript?.(transcript);
        }

        setState("idle");
        resolve(transcript);
      };

      mediaRecorder.stop();
    });
  }, [state, transcribeAudio, onTranscript]);

  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || state !== "recording") return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkLevel = () => {
      if (!analyserRef.current || state !== "recording") return;

      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalizedLevel = Math.min(100, Math.round((average / 255) * 100 * 2));
      setAudioLevel(normalizedLevel);

      // Convert to dB for silence detection
      const rms = Math.sqrt(dataArray.reduce((a, b) => a + b * b, 0) / dataArray.length);
      const db = rms > 0 ? 20 * Math.log10(rms / 255) : -100;

      // Silence detection for single and conversation modes
      const currentMode = currentModeRef.current;
      if (currentMode === "single" || currentMode === "conversation") {
        if (db < silenceThreshold) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > silenceDuration) {
            // Silence detected long enough, stop recording
            stopRecording();
            return;
          }
        } else {
          // Sound detected, reset silence timer
          silenceStartRef.current = null;
        }
      }

      animationFrameRef.current = requestAnimationFrame(checkLevel);
    };

    checkLevel();
  }, [state, silenceThreshold, silenceDuration, stopRecording]);

  const startRecording = useCallback(async (recordingMode?: RecordingMode) => {
    const modeToUse = recordingMode ?? mode;
    setMode(modeToUse);
    currentModeRef.current = modeToUse;
    setError(null);
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Set up audio analysis for level monitoring and silence detection
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setState("recording");
      startTimeRef.current = Date.now();

      // Update duration every 100ms
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 100);

      // Start monitoring audio levels
      monitorAudioLevel();

      // Start Web Speech API for interim transcription (parallel with MediaRecorder)
      const SpeechRecognitionAPI =
        typeof window !== "undefined"
          ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
          : undefined;

      if (SpeechRecognitionAPI) {
        try {
          const recognition = new SpeechRecognitionAPI();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language === "sv" ? "sv-SE" : language;
          recognition.maxAlternatives = 1;

          let finalizedText = "";

          recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal) {
                finalizedText += result[0].transcript + " ";
              } else {
                interim += result[0].transcript;
              }
            }
            const fullText = (finalizedText + interim).trim();
            setInterimTranscript(fullText);
            onInterimTranscriptRef.current?.(fullText);
          };

          recognition.onerror = () => {
            // Silently ignore — SpeechRecognition is best-effort
          };

          recognition.onend = () => {
            // Restart if still recording (SpeechRecognition may auto-stop)
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              try {
                recognition.start();
              } catch {
                // ignore — may fail if already started
              }
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {
          // SpeechRecognition not available — fallback to Whisper-only
        }
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to access microphone";
      setError(errorMsg);
      onError?.(errorMsg);
      cleanup();
    }
  }, [mode, cleanup, onError, monitorAudioLevel]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    setState("idle");
    cleanup();
  }, [state, cleanup]);

  const exitConversationMode = useCallback(() => {
    if (mode === "conversation") {
      setMode("single");
      currentModeRef.current = "single";
      if (state === "recording") {
        cancelRecording();
      }
    }
  }, [mode, state, cancelRecording]);

  return {
    state,
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    mode,
    startRecording,
    stopRecording,
    cancelRecording,
    setMode,
    exitConversationMode,
    isConversationMode: mode === "conversation",
    error,
    duration,
    audioLevel,
    interimTranscript,
  };
}

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return "audio/webm";
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  return "webm";
}
