/**
 * Text-to-Speech API route.
 * Supports two providers: OpenAI TTS and ElevenLabs.
 * Returns audio stream for the given text.
 * Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel (multilingual)

type TTSProvider = "openai" | "elevenlabs";

// OpenAI voices - alloy works reasonably well for Swedish
type OpenAIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { text, provider = "openai", voice } = body as {
      text: string;
      provider?: TTSProvider;
      voice?: string;
    };

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Limit text length to prevent abuse
    const maxLength = 4096;
    const truncatedText = text.slice(0, maxLength);

    if (provider === "elevenlabs") {
      return await handleElevenLabs(truncatedText, voice);
    }

    return await handleOpenAI(truncatedText, voice as OpenAIVoice | undefined);
  } catch (error) {
    console.error("[TTS] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}

async function handleOpenAI(text: string, voice?: OpenAIVoice) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const response = await openai.audio.speech.create({
    model: "tts-1", // Use tts-1 for lower latency, tts-1-hd for higher quality
    voice: voice || "nova", // Nova has good multilingual support
    input: text,
    response_format: "mp3",
  });

  const audioBuffer = await response.arrayBuffer();

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength.toString(),
    },
  });
}

async function handleElevenLabs(text: string, voiceId?: string) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { error: "ElevenLabs API key not configured" },
      { status: 500 }
    );
  }

  const selectedVoiceId = voiceId || ELEVENLABS_VOICE_ID;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
    {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2", // Best for Swedish
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TTS] ElevenLabs error:", errorText);
    return NextResponse.json(
      { error: "ElevenLabs API error" },
      { status: response.status }
    );
  }

  const audioBuffer = await response.arrayBuffer();

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength.toString(),
    },
  });
}
