/**
 * Unified semantic search across all sources: KnowledgeEntity, MessageChunk, DocumentChunk.
 * Generates ONE embedding and searches all sources in parallel.
 * Graceful degradation: if any source fails, others continue.
 */

import { prisma } from "@/lib/db";
import { generateEmbedding } from "./embeddings";
import { logger } from "@/lib/logger";

export type UnifiedSearchResult = {
  source: "knowledge" | "conversation" | "document";
  text: string;
  similarity: number;
  metadata?: Record<string, unknown>;
};

export async function searchAllSources(opts: {
  queryText: string;
  userId: string;
  tenantId: string;
  projectId?: string | null;
  accessibleProjectIds?: string[];
  limit?: number;
  threshold?: number;
}): Promise<UnifiedSearchResult[]> {
  const {
    queryText,
    userId,
    tenantId,
    projectId,
    accessibleProjectIds,
    limit = 20,
    threshold = 0.5,
  } = opts;

  // Generate ONE embedding for the query
  const queryEmbedding = await generateEmbedding(queryText);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Search all sources in parallel
  const [knowledgeResults, conversationResults, documentResults] =
    await Promise.all([
      searchKnowledgeEntities(vectorStr, tenantId, userId, threshold).catch(
        (err) => {
          logger.warn("Unified search: KnowledgeEntity search failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          return [] as UnifiedSearchResult[];
        }
      ),

      searchMessageChunks(
        vectorStr,
        tenantId,
        userId,
        threshold,
        projectId ?? undefined
      ).catch((err) => {
        logger.warn("Unified search: MessageChunk search failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as UnifiedSearchResult[];
      }),

      searchDocumentChunks(
        vectorStr,
        tenantId,
        threshold,
        projectId ?? undefined,
        accessibleProjectIds
      ).catch((err) => {
        logger.warn("Unified search: DocumentChunk search failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as UnifiedSearchResult[];
      }),
    ]);

  // Combine, sort by similarity, take top results
  const allResults = [
    ...knowledgeResults,
    ...conversationResults,
    ...documentResults,
  ]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  logger.info("Unified search complete", {
    knowledge: knowledgeResults.length,
    conversation: conversationResults.length,
    document: documentResults.length,
    total: allResults.length,
  });

  return allResults;
}

async function searchKnowledgeEntities(
  vectorStr: string,
  tenantId: string,
  userId: string,
  threshold: number
): Promise<UnifiedSearchResult[]> {
  const results = await prisma.$queryRawUnsafe<
    Array<{
      entityType: string;
      entityId: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }>
  >(
    `SELECT "entityType", "entityId", "metadata",
            1 - ("embedding" <=> $1::vector) AS similarity
     FROM "KnowledgeEntity"
     WHERE "tenantId" = $2
       AND "metadata"->>'userId' = $3
       AND "embedding" IS NOT NULL
       AND 1 - ("embedding" <=> $1::vector) > $4
     ORDER BY "embedding" <=> $1::vector
     LIMIT 15`,
    vectorStr,
    tenantId,
    userId,
    threshold
  );

  return results.map((r) => ({
    source: "knowledge" as const,
    text: `${r.entityType} ${r.entityId}: ${JSON.stringify(r.metadata)}`,
    similarity: r.similarity,
    metadata: r.metadata,
  }));
}

async function searchMessageChunks(
  vectorStr: string,
  tenantId: string,
  userId: string,
  threshold: number,
  projectId?: string
): Promise<UnifiedSearchResult[]> {
  const conditions = [
    `mc."tenantId" = $2`,
    `mc."userId" = $3`,
    `mc."embedding" IS NOT NULL`,
    `1 - (mc."embedding" <=> $1::vector) > $4`,
  ];
  const params: (string | number)[] = [vectorStr, tenantId, userId, threshold];
  let nextParam = 5;

  if (projectId) {
    conditions.push(`mc."projectId" = $${nextParam}`);
    params.push(projectId);
    nextParam++;
  }

  const limitParam = nextParam;
  params.push(10);

  const results = await prisma.$queryRawUnsafe<
    Array<{
      content: string;
      similarity: number;
      conversationId: string;
    }>
  >(
    `SELECT mc."content",
            1 - (mc."embedding" <=> $1::vector) AS similarity,
            mc."conversationId"
     FROM "MessageChunk" mc
     WHERE ${conditions.join(" AND ")}
     ORDER BY mc."embedding" <=> $1::vector
     LIMIT $${limitParam}`,
    ...params
  );

  return results.map((r) => ({
    source: "conversation" as const,
    text:
      r.content.length > 300 ? r.content.slice(0, 300) + "..." : r.content,
    similarity: r.similarity,
  }));
}

async function searchDocumentChunks(
  vectorStr: string,
  tenantId: string,
  threshold: number,
  projectId?: string,
  accessibleProjectIds?: string[]
): Promise<UnifiedSearchResult[]> {
  // Only search if we have project context
  const projectIds = projectId
    ? [projectId]
    : accessibleProjectIds ?? [];
  if (projectIds.length === 0) return [];

  const placeholders = projectIds.map((_, i) => `$${i + 4}`).join(", ");
  const params: (string | number)[] = [
    vectorStr,
    tenantId,
    threshold,
    ...projectIds,
  ];
  const limitParam = projectIds.length + 4;
  params.push(10);

  const results = await prisma.$queryRawUnsafe<
    Array<{
      content: string;
      similarity: number;
      fileName: string;
      projectName: string | null;
    }>
  >(
    `SELECT dc."content",
            1 - (dc."embedding" <=> $1::vector) AS similarity,
            f."name" AS "fileName",
            p."name" AS "projectName"
     FROM "DocumentChunk" dc
     JOIN "File" f ON f."id" = dc."fileId"
     LEFT JOIN "Project" p ON p."id" = dc."projectId"
     WHERE dc."tenantId" = $2
       AND dc."embedding" IS NOT NULL
       AND dc."projectId" IN (${placeholders})
       AND 1 - (dc."embedding" <=> $1::vector) > $3
     ORDER BY dc."embedding" <=> $1::vector
     LIMIT $${limitParam}`,
    ...params
  );

  return results.map((r) => ({
    source: "document" as const,
    text: `[${r.fileName}${r.projectName ? ` i ${r.projectName}` : ""}]: ${r.content.length > 300 ? r.content.slice(0, 300) + "..." : r.content}`,
    similarity: r.similarity,
  }));
}
