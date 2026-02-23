/**
 * AI provider configuration for Vercel AI SDK.
 * Claude is the primary chat model. OpenAI handles embeddings (see embeddings.ts).
 * Mistral handles OCR (see ocr.ts). All chat streaming goes through this module.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { mistral } from "@ai-sdk/mistral";
import { xai } from "@ai-sdk/xai";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type ProviderKey =
  | "CLAUDE_HAIKU"
  | "CLAUDE_SONNET"
  | "OPENAI"
  | "MISTRAL_LARGE"
  | "MISTRAL_SMALL"
  | "GROK_FAST"
  | "GEMINI_PRO"
  | "GEMINI_FLASH";

/** Model metadata for UI display. */
export type ModelOption = {
  key: ProviderKey;
  label: string;
  description: string;
  provider: "anthropic" | "openai" | "mistral" | "xai" | "google";
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    key: "CLAUDE_HAIKU",
    label: "Claude Haiku 4.5",
    description: "Snabb och effektiv",
    provider: "anthropic",
  },
  {
    key: "CLAUDE_SONNET",
    label: "Claude Sonnet 4.5",
    description: "Balans mellan snabbhet och kapacitet",
    provider: "anthropic",
  },
  {
    key: "GROK_FAST",
    label: "Grok 4.1 Fast",
    description: "xAI – snabb och kraftfull",
    provider: "xai",
  },
  {
    key: "GEMINI_PRO",
    label: "Gemini 3.1 Pro",
    description: "Google – avancerad analys och resonemang",
    provider: "google",
  },
  {
    key: "GEMINI_FLASH",
    label: "Gemini 3 Flash",
    description: "Google – frontier-klass, snabb respons",
    provider: "google",
  },
  {
    key: "MISTRAL_LARGE",
    label: "Mistral Large 3",
    description: "Mistral – mest kapabel",
    provider: "mistral",
  },
  {
    key: "MISTRAL_SMALL",
    label: "Mistral Small 3.2",
    description: "Mistral – snabb och effektiv",
    provider: "mistral",
  },
];

/** Model IDs per provider key. */
const MODEL_IDS: Record<ProviderKey, string> = {
  CLAUDE_HAIKU: "claude-haiku-4-5-20251001",
  CLAUDE_SONNET: "claude-sonnet-4-5-20250929",
  OPENAI: "gpt-4o",
  MISTRAL_LARGE: "mistral-large-2512",
  MISTRAL_SMALL: "mistral-small-2506",
  GROK_FAST: "grok-4-0709",
  GEMINI_PRO: "gemini-3.1-pro-preview",
  GEMINI_FLASH: "gemini-3-flash-preview",
};

/** Returns a Vercel AI SDK LanguageModel for the given provider. */
export function getModel(provider: ProviderKey = "CLAUDE_HAIKU"): LanguageModel {
  switch (provider) {
    case "CLAUDE_HAIKU":
      return anthropic(MODEL_IDS.CLAUDE_HAIKU);
    case "CLAUDE_SONNET":
      return anthropic(MODEL_IDS.CLAUDE_SONNET);
    case "OPENAI":
      return openai(MODEL_IDS.OPENAI);
    case "MISTRAL_LARGE":
      return mistral(MODEL_IDS.MISTRAL_LARGE);
    case "MISTRAL_SMALL":
      return mistral(MODEL_IDS.MISTRAL_SMALL);
    case "GROK_FAST":
      return xai(MODEL_IDS.GROK_FAST);
    case "GEMINI_PRO":
      return google(MODEL_IDS.GEMINI_PRO);
    case "GEMINI_FLASH":
      return google(MODEL_IDS.GEMINI_FLASH);
  }
}

/** The default model used for chat assistants (Claude Haiku). */
export const defaultModel = getModel("CLAUDE_HAIKU");

/** Shared streaming configuration. */
export const streamConfig = {
  maxTokens: 4096,
  temperature: 0.7,
} as const;
