/**
 * AI Adapter — HTTP client that calls the web app's internal Discord chat API.
 * This bridges the Discord bot to the shared AI Core without importing Next.js modules.
 */

import { env } from "../lib/env.js";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
  /** Base64-encoded image data for vision analysis. */
  imageBase64?: string;
  /** MIME type of the image (e.g. "image/jpeg"). */
  imageMimeType?: string;
}

export interface AIRequestOptions {
  userId: string;
  tenantId: string;
  userName?: string;
  userRole: string;
  projectId?: string;
  conversationId?: string;
  /** Whether this is a DM (direct message) vs a guild channel message. */
  isDM?: boolean;
  messages: AIMessage[];
}

export interface AIResponse {
  text: string;
  conversationId: string;
  provider: string;
}

const API_URL = env.WEB_APP_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

// Log the URL on startup for debugging
console.log(`[ai-adapter] Using WEB_APP_URL: ${API_URL}`);

/**
 * Call the web app's internal AI chat endpoint.
 * Returns the full AI response text (non-streaming).
 */
export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const url = `${API_URL}/api/internal/discord-chat`;
  console.log(`[ai-adapter] Calling: ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      userId: options.userId,
      tenantId: options.tenantId,
      userName: options.userName,
      userRole: options.userRole,
      projectId: options.projectId,
      conversationId: options.conversationId,
      isDM: options.isDM,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.imageBase64 && {
          imageBase64: m.imageBase64,
          imageMimeType: m.imageMimeType ?? "image/jpeg",
        }),
      })),
    }),
    signal: AbortSignal.timeout(300_000), // 5 min timeout for AI responses
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    let errorMessage: string;
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed.error ?? errorBody;
    } catch {
      errorMessage = errorBody;
    }
    throw new Error(`AI API error (${response.status}): ${errorMessage}`);
  }

  const data = (await response.json()) as AIResponse;
  return data;
}
