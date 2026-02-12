import { NextResponse } from "next/server";
import { streamText, convertToModelMessages } from "ai";
import { getModel, streamConfig } from "@/lib/ai/providers";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    logger.info("debug-ai: starting test");

    const model = getModel("CLAUDE");
    logger.info("debug-ai: model created");

    const messages = await convertToModelMessages([
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "Say hello in one word" }] }
    ]);
    logger.info("debug-ai: messages converted");

    const result = streamText({
      model,
      messages,
      ...streamConfig,
      maxTokens: 50,
      onError: ({ error }) => {
        logger.error("debug-ai: stream error", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      },
    });

    logger.info("debug-ai: stream created, returning response");
    return result.toUIMessageStreamResponse();
  } catch (err) {
    logger.error("debug-ai: caught error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
