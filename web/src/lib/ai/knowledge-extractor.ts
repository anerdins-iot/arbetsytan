/**
 * Knowledge extraction from finished conversations.
 * Extracts structured entities (project, task, user, preference, common_question) via LLM
 * and stores them in KnowledgeEntity (tenant-scoped, userId in metadata).
 * Caller may run after conversation is summarized or closed.
 */
import { generateText } from "ai";
import { getModel } from "@/lib/ai/providers";
import { tenantDb, type TenantScopedClient, type UserScopedClient } from "@/lib/db";
import { logger } from "@/lib/logger";

const MIN_CONFIDENCE = 0.8;
const TTL_DAYS = 90;

const ENTITY_TYPES = ["project", "task", "user", "preference", "common_question"] as const;
export type KnowledgeEntityType = (typeof ENTITY_TYPES)[number];

export type ExtractedEntity = {
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  confidence: number;
};

export type ExtractAndSaveKnowledgeOptions = {
  /** Client to read conversation and messages (e.g. userDb for personal AI). */
  db: TenantScopedClient | UserScopedClient;
  conversationId: string;
  tenantId: string;
  userId: string;
};

/**
 * Loads a conversation with messages, extracts structured entities via LLM,
 * and persists them to KnowledgeEntity (tenant-scoped). Only entities with
 * confidence >= MIN_CONFIDENCE are saved. userId is stored in metadata.
 * Degrades gracefully: on any error, logs and returns { saved: 0 } without throwing.
 */
export async function extractAndSaveKnowledge(
  opts: ExtractAndSaveKnowledgeOptions
): Promise<{ saved: number }> {
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
    if (!conversation || conversation.messages.length < 2) {
      return { saved: 0 };
    }
    const transcript = conversation.messages
      .map((m) => `${m.role === "USER" ? "Användare" : "Assistent"}: ${m.content}`)
      .join("\n\n");

    const model = getModel("CLAUDE");
    const { text } = await generateText({
      model,
      system: `Du analyserar konversationer och extraherar strukturerad kunskap. Svara endast med ett enda JSON-objekt i formatet:
{"entities":[{"entityType":"...","entityId":"...","metadata":{},"confidence":0.0-1.0}]}
Tillåtna entityType: project, task, user, preference, common_question.
- project: när projekt nämns (entityId = projekt-id eller namn/slug).
- task: när uppgifter nämns (entityId = uppgifts-id eller kort beskrivning).
- user: när personer/roller nämns (entityId = användar-id eller namn).
- preference: användarpreferenser (språk, visning, etc.; entityId = t.ex. "language:sv").
- common_question: återkommande frågetyper (entityId = kort etikett).
metadata: fritextfält för typ-specifik info. confidence: 0–1, endast >= 0.8 lagras. Ingen annan text utöver JSON.`,
      prompt: `Analysera konversationen och extrahera entiteter:\n\n${transcript.slice(0, 25000)}`,
    });

    const parsed = parseEntitiesResponse(text);
    if (!parsed.length) return { saved: 0 };

    const tdb = tenantDb(tenantId, { skipEmit: true });
    let saved = 0;
    for (const e of parsed) {
      if (e.confidence < MIN_CONFIDENCE) continue;
      const entityType = normalizeEntityType(e.entityType);
      if (!entityType) continue;
      const metadata = { ...e.metadata, userId };
      try {
        const existing = await tdb.knowledgeEntity.findFirst({
          where: { entityType, entityId: e.entityId },
        });
        if (existing) {
          await tdb.knowledgeEntity.update({
            where: { id: existing.id },
            data: { lastSeen: new Date(), confidence: e.confidence, metadata },
          });
        } else {
          await tdb.knowledgeEntity.create({
            data: {
              entityType,
              entityId: e.entityId,
              metadata,
              confidence: e.confidence,
            },
          });
        }
        saved++;
      } catch (err) {
        logger.warn("Knowledge entity save failed", {
          entityType,
          entityId: e.entityId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (saved > 0) {
      logger.info("Knowledge extraction completed", { conversationId, tenantId, saved });
    }
    return { saved };
  } catch (err) {
    logger.warn("Knowledge extraction failed", {
      conversationId,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { saved: 0 };
  }
}

function parseEntitiesResponse(text: string): ExtractedEntity[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const data = JSON.parse(jsonMatch[0]) as { entities?: unknown[] };
    if (!Array.isArray(data.entities)) return [];
    return data.entities
      .filter(
        (e): e is ExtractedEntity =>
          e != null &&
          typeof e === "object" &&
          typeof (e as ExtractedEntity).entityType === "string" &&
          typeof (e as ExtractedEntity).entityId === "string" &&
          typeof (e as ExtractedEntity).confidence === "number" &&
          (e as ExtractedEntity).confidence >= 0 &&
          (e as ExtractedEntity).confidence <= 1
      )
      .map((e) => ({
        entityType: String(e.entityType),
        entityId: String(e.entityId),
        metadata:
          e.metadata != null && typeof e.metadata === "object" && !Array.isArray(e.metadata)
            ? (e.metadata as Record<string, unknown>)
            : {},
        confidence: Number(e.confidence),
      }));
  } catch {
    return [];
  }
}

function normalizeEntityType(value: string): KnowledgeEntityType | null {
  const v = value.toLowerCase().trim();
  if (ENTITY_TYPES.includes(v as KnowledgeEntityType)) return v as KnowledgeEntityType;
  if (v === "common_question" || v === "common question") return "common_question";
  return null;
}

/**
 * Deletes KnowledgeEntity rows for the tenant that are older than TTL_DAYS.
 * Use tenantDb(tenantId) so all operations are tenant-scoped.
 */
export async function cleanupOldKnowledge(
  tenantId: string,
  db: TenantScopedClient
): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TTL_DAYS);
    const result = await db.knowledgeEntity.deleteMany({
      where: { lastSeen: { lt: cutoff } },
    });
    if (result.count > 0) {
      logger.info("Knowledge cleanup completed", { tenantId, deleted: result.count });
    }
    return result.count;
  } catch (err) {
    logger.warn("Knowledge cleanup failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
