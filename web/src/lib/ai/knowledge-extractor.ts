/**
 * Extract structured knowledge from AI conversation messages and upsert into KnowledgeEntity.
 * Called from chat route onFinish (fire-and-forget). Same pattern as summarize-conversation.
 */
import { generateText } from "ai";
import { getModel } from "@/lib/ai/providers";
import type { TenantScopedClient, UserScopedClient } from "@/lib/db";
import { prisma } from "@/lib/db";
import { generateEmbedding } from "./embeddings";
import { logger } from "@/lib/logger";

const CONFIDENCE_THRESHOLD = 0.7;
const ENTITY_TYPES = ["project", "task", "user", "preference", "common_question"] as const;
const CLEANUP_DAYS = 90;

export type ExtractAndSaveKnowledgeOptions = {
  db: TenantScopedClient;
  udb: UserScopedClient;
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
    // Strip markdown code fences if present (e.g. ```json\n...\n```)
    const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(stripped) as { entities?: unknown[] };
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
  const { db, udb, conversationId, tenantId, userId } = opts;
  logger.info("extractAndSaveKnowledge: starting", { conversationId, tenantId, userId });
  try {
    // Use userDb (udb) to fetch conversation — it's scoped to userId which is correct for personal conversations
    const conversation = await udb.conversation.findFirst({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true },
        },
      },
    });
    if (!conversation || conversation.messages.length === 0) {
      logger.info("extractAndSaveKnowledge: no conversation or messages found", { conversationId });
      return { extracted: 0 };
    }
    logger.info("extractAndSaveKnowledge: found messages", { count: conversation.messages.length });

    const transcript = conversation.messages
      .map((m) =>
        `${m.role === "USER" ? "Användare" : "Assistent"}: ${m.content}`
      )
      .join("\n\n");

    const system = `Du extraherar strukturerad kunskap från konversationer. Svara ENDAST med ett enda JSON-objekt i formatet: { "entities": [ { "entityType": "...", "entityId": "...", "metadata": {}, "confidence": 0.0-1.0 } ] }. entityType MÅSTE vara en av: ${ENTITY_TYPES.join(", ")}. entityId är ett ID eller kort identifierare. confidence är 0–1. Inga andra texter.`;
    const prompt = `Analysera konversationen och lista entiteter (projekt, uppgifter, användare, preferenser, vanliga frågor) som nämnts med hög tillförlitlighet.\n\nKonversation:\n\n${transcript}`;

    // Try Claude first, fall back to OpenAI if overloaded
    let text: string;
    try {
      logger.info("extractAndSaveKnowledge: calling Claude for extraction");
      const result = await generateText({ model: getModel("CLAUDE_HAIKU"), system, prompt });
      text = result.text;
      logger.info("extractAndSaveKnowledge: Claude responded", { textLength: text?.length ?? 0 });
    } catch (primaryErr) {
      const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      logger.warn("extractAndSaveKnowledge: Claude failed, trying OpenAI fallback", { error: errMsg });
      const result = await generateText({ model: getModel("OPENAI"), system, prompt });
      text = result.text;
      logger.info("extractAndSaveKnowledge: OpenAI responded", { textLength: text?.length ?? 0 });
    }

    logger.info("extractAndSaveKnowledge: parsing result", { rawText: text?.slice(0, 200) });
    const entities = parseExtractionResult(text ?? "{}");
    logger.info("extractAndSaveKnowledge: entities found", { count: entities.length, aboveThreshold: entities.filter(e => e.confidence >= CONFIDENCE_THRESHOLD).length });
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
        let recordId: string;
        if (existing) {
          await db.knowledgeEntity.update({
            where: { id: existing.id },
            data: {
              lastSeen: new Date(),
              confidence: e.confidence,
              metadata,
            },
          });
          recordId = existing.id;
        } else {
          const created = await db.knowledgeEntity.create({
            data: {
              tenantId,
              entityType: e.entityType,
              entityId: e.entityId,
              metadata,
              confidence: e.confidence,
            },
            select: { id: true },
          });
          recordId = created.id;
        }
        saved++;

        // Generate and store embedding (graceful degradation)
        try {
          const embeddingText = `${e.entityType} ${e.entityId} ${JSON.stringify(metadata)}`;
          const embeddingVector = await generateEmbedding(embeddingText);
          const vectorStr = `[${embeddingVector.join(",")}]`;
          await prisma.$queryRawUnsafe(
            `UPDATE "KnowledgeEntity" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3`,
            vectorStr,
            recordId,
            tenantId
          );
        } catch (embErr) {
          logger.warn("Failed to generate/store knowledge embedding, entity saved without embedding", {
            entityType: e.entityType,
            entityId: e.entityId,
            error: embErr instanceof Error ? embErr.message : String(embErr),
          });
        }
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
