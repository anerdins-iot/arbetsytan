/**
 * AI provider configuration for Vercel AI SDK.
 * Claude is the primary chat model. OpenAI handles embeddings (see embeddings.ts).
 * Mistral handles OCR (see ocr.ts). All chat streaming goes through this module.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { mistral } from "@ai-sdk/mistral";
import type { LanguageModel } from "ai";

export type ProviderKey = "CLAUDE" | "OPENAI" | "MISTRAL";

/** Default chat model per provider. */
const MODEL_IDS: Record<ProviderKey, string> = {
  CLAUDE: "claude-sonnet-4-5-20250929",
  OPENAI: "gpt-4o",
  MISTRAL: "mistral-large-latest",
};

/** Returns a Vercel AI SDK LanguageModel for the given provider. */
export function getModel(provider: ProviderKey = "CLAUDE"): LanguageModel {
  switch (provider) {
    case "CLAUDE":
      return anthropic(MODEL_IDS.CLAUDE);
    case "OPENAI":
      return openai(MODEL_IDS.OPENAI);
    case "MISTRAL":
      return mistral(MODEL_IDS.MISTRAL);
  }
}

/** The default model used for chat assistants (Claude). */
export const defaultModel = getModel("CLAUDE");

/** Shared streaming configuration. */
export const streamConfig = {
  maxTokens: 4096,
  temperature: 0.7,
} as const;
