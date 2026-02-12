/**
 * Summarize long conversations and store in Conversation.summary.
 * Called when message count exceeds MESSAGE_SUMMARY_THRESHOLD.
 * Uses tenantDb(tenantId) — caller must pass valid tenant context.
 */
import { generateText } from "ai";
import { getModel } from "@/lib/ai/providers";
import type { TenantScopedClient } from "@/lib/db";
import { MESSAGE_SUMMARY_THRESHOLD } from "@/lib/ai/conversation-config";

const KEEP_RECENT = 10;

export type SummarizeOptions = {
  db: TenantScopedClient;
  conversationId: string;
};

/**
 * If the conversation has more than MESSAGE_SUMMARY_THRESHOLD messages,
 * summarize the older part (all but last KEEP_RECENT) and update Conversation.summary.
 * Idempotent: if summary already exists and count hasn't grown much, can skip.
 */
export async function summarizeConversationIfNeeded(
  opts: SummarizeOptions
): Promise<{ summarized: boolean }> {
  const { db, conversationId } = opts;
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
    },
  });
  if (!conversation || conversation.messages.length <= MESSAGE_SUMMARY_THRESHOLD) {
    return { summarized: false };
  }
  const messages = conversation.messages;
  const toSummarize = messages.slice(0, messages.length - KEEP_RECENT);
  if (toSummarize.length < 2) return { summarized: false };

  const transcript = toSummarize
    .map((m) => `${m.role === "USER" ? "Användare" : "Assistent"}: ${m.content}`)
    .join("\n\n");

  const model = getModel("CLAUDE");
  const { text } = await generateText({
    model,
    system: "Du sammanfattar konversationer på svenska. Var koncis, max 250 ord. Behåll viktiga beslut, uppgifter och fakta.",
    prompt: `Sammanfatta följande konversation:\n\n${transcript}`,
  });

  await db.conversation.update({
    where: { id: conversationId },
    data: { summary: text.trim() || null },
  });
  return { summarized: true };
}
