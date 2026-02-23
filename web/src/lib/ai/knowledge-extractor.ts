/**
 * Extract structured knowledge from AI conversation messages and upsert into KnowledgeEntity.
 * Called from chat route onFinish (fire-and-forget). Same pattern as summarize-conversation.
 */
import { generateText } from "ai";
import { getModel } from "@/lib/ai/providers";
import type { TenantScopedClient } from "@/lib/db";
import { logger } from "@/lib/logger";

const CONFIDENCE_THRESHOLD = 0.7;
const ENTITY_TYPES = ["project", "task", "user", "preference", "common_question"] as const;
const CLEANUP_DAYS = 90;

export type ExtractAndSaveKnowledgeOptions = {
  db: TenantScopedClient;
  conversationId: string;
  tenantId: string;
  userId: string;
};

type ExtractedEntity = {
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  confidence: number;
};

function parseExtractionResult(text: string): ExtractedEntity[] {
  try {
    const parsed = JSON.parse(text) as { entities?: unknown[] };
    if (!Array.isArray(parsed?.entities)) return [];
    return parsed.entities
      .filter(
        (e): e is ExtractedEntity =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as ExtractedEntity).entityType === "string" &&
          typeof (e as ExtractedEntity).entityId === "string" &&
          typeof (e as ExtractedEntity).confidence === "number"
      )
      .map((e) => ({
        entityType: (e as ExtractedEntity).entityType,
        entityId: (e as ExtractedEntity).entityId,
        metadata: typeof (e as ExtractedEntity).metadata === "object" && (e as ExtractedEntity).metadata !== null
          ? (e as ExtractedEntity).metadata as Record<string, unknown>
          : {},
        confidence: (e as ExtractedEntity).confidence,
      }));
  } catch {
    return [];
  }
}

/**
 * Fetch conversation messages, send transcript to LLM, extract entities (JSON),
 * filter by confidence >= CONFIDENCE_THRESHOLD, add userId to metadata, upsert to KnowledgeEntity.
 * Graceful degradation: no uncaught errors.
 */
export async function extractAndSaveKnowledge(
  opts: ExtractAndSaveKnowledgeOptions
): Promise<{ extracted: number }> {
  const { db, conversationId, tenantId, userId } = opts;
  try {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true },
        },
      },
    });
    if (!conversation || conversation.messages.length === 0) {
      return { extracted: 0 };
    }

    const transcript = conversation.messages
      .map((m) =>
        `${m.role === "USER" ? "Användare" : "Assistent"}: ${m.content}`
      )
      .join("\n\n");

    const model = getModel("CLAUDE");
    const { text } = await generateText({
      model,
      system: `Du extraherar strukturerad kunskap från konversationer. Svara ENDAST med ett enda JSON-objekt i formatet: { "entities": [ { "entityType": "...", "entityId": "...", "metadata": {}, "confidence": 0.0-1.0 } ] }. entityType MÅSTE vara en av: ${ENTITY_TYPES.join(", ")}. entityId är ett ID eller kort identifierare. confidence är 0–1. Inga andra texter.`,
      prompt: `Analysera konversationen och lista entiteter (projekt, uppgifter, användare, preferenser, vanliga frågor) som nämnts med hög tillförlitlighet.\n\nKonversation:\n\n${transcript}`,
    });

    const entities = parseExtractionResult(text ?? "{}");
    const toSave = entities.filter((e) => e.confidence >= CONFIDENCE_THRESHOLD);
    if (toSave.length === 0) return { extracted: 0 };

    let saved = 0;
    for (const e of toSave) {
      try {
        const metadata = { ...e.metadata, userId };
        const existing = await db.knowledgeEntity.findFirst({
          where: {
            tenantId,
            entityType: e.entityType,
            entityId: e.entityId,
          },
        });
        if (existing) {
          await db.knowledgeEntity.update({
            where: { id: existing.id },
            data: {
              lastSeen: new Date(),
              confidence: e.confidence,
              metadata,
            },
          });
        } else {
          await db.knowledgeEntity.create({
            data: {
              tenantId,
              entityType: e.entityType,
              entityId: e.entityId,
              metadata,
              confidence: e.confidence,
            },
          });
        }
        saved++;
      } catch (err) {
        logger.warn("Knowledge entity upsert failed", {
          entityType: e.entityType,
          entityId: e.entityId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { extracted: saved };
  } catch (err) {
    logger.warn("Knowledge extraction failed", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { extracted: 0 };
  }
}

/**
 * Remove KnowledgeEntity rows older than CLEANUP_DAYS. Call sporadically (e.g. 1% of requests).
 */
export async function cleanupOldKnowledge(
  tenantId: string,
  db: TenantScopedClient
): Promise<{ deleted: number }> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);
    const result = await db.knowledgeEntity.deleteMany({
      where: { tenantId, lastSeen: { lt: cutoff } },
    });
    return { deleted: result.count };
  } catch (err) {
    logger.warn("Knowledge cleanup failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { deleted: 0 };
  }
}
