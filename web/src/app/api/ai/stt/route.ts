/**
 * Speech-to-Text API route using OpenAI Whisper.
 * Accepts audio file and returns transcribed text.
 * Optimized for Swedish language.
 * Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Maximum audio file size (25MB - Whisper API limit)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Supported audio formats
const SUPPORTED_FORMATS = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/m4a",
];

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

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "sv"; // Default Swedish

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Audio file too large. Maximum size is 25MB." },
        { status: 400 }
      );
    }

    // Validate file type (be lenient since MediaRecorder might produce various formats)
    const mimeType = audioFile.type || "audio/webm";
    if (!SUPPORTED_FORMATS.some((format) => mimeType.startsWith(format.split("/")[0]))) {
      return NextResponse.json(
        { error: `Unsupported audio format: ${mimeType}` },
        { status: 400 }
      );
    }

    // Convert File to the format OpenAI expects
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension from mime type
    const extension = getExtensionFromMimeType(mimeType);
    const filename = `audio.${extension}`;

    // Create a File object that OpenAI SDK can handle
    const file = new File([buffer], filename, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language, // Specify language for better accuracy
      response_format: "json",
    });

    return NextResponse.json({
      text: transcription.text,
      language,
    });
  } catch (error) {
    console.error("[STT] Error:", error);

    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: `Transcription failed: ${error.message}` },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
  };

  return mimeToExt[mimeType] || "webm";
}
