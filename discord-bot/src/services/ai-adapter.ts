/**
 * AI Adapter — HTTP client that calls the web app's internal Discord chat API.
 * This bridges the Discord bot to the shared AI Core without importing Next.js modules.
 */

export interface AIRequestOptions {
  userId: string;
  tenantId: string;
  userName?: string;
  userRole: string;
  projectId?: string;
  conversationId?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AIResponse {
  text: string;
  conversationId: string;
  provider: string;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

/**
 * Call the web app's internal AI chat endpoint.
 * Returns the full AI response text (non-streaming).
 */
export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const url = `${API_URL}/api/internal/discord-chat`;

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
      messages: options.messages,
    }),
    signal: AbortSignal.timeout(120_000), // 2 min timeout for AI responses
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
