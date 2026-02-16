/**
 * Message (chat) embedding processing and search.
 * Uses pgvector for semantic search on conversation content via MessageChunk.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateEmbedding, generateEmbeddings } from "./embeddings";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

/**
 * Split message content into overlapping chunks for embedding.
 */
export function chunkMessageContent(content: string): string[] {
  const text = (content ?? "").trim();
  if (text.length === 0) return [];
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Process embeddings for a chat message.
 * Creates MessageChunk records and generates + stores embedding vectors.
 */
export async function processMessageEmbeddings(
  messageId: string,
  conversationId: string,
  tenantId: string,
  userId: string,
  projectId: string | null
): Promise<void> {
  logger.info("processMessageEmbeddings: starting", {
    messageId,
    conversationId,
    tenantId,
  });

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, content: true },
  });

  if (!message) {
    logger.warn("processMessageEmbeddings: message not found", {
      messageId,
      conversationId,
    });
    return;
  }

  const textChunks = chunkMessageContent(message.content);
  if (textChunks.length === 0) {
    logger.warn("processMessageEmbeddings: no content to chunk", { messageId });
    return;
  }

  const existingChunks = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "MessageChunk" WHERE "messageId" = $1 AND "tenantId" = $2`,
    messageId,
    tenantId
  );

  if (existingChunks.length > 0) {
    const chunksWithoutEmbedding = await prisma.$queryRawUnsafe<
      Array<{ id: string; content: string }>
    >(
      `SELECT "id", "content" FROM "MessageChunk"
       WHERE "messageId" = $1 AND "tenantId" = $2 AND "embedding" IS NULL`,
      messageId,
      tenantId
    );

    if (chunksWithoutEmbedding.length === 0) {
      logger.info("processMessageEmbeddings: all chunks already have embeddings", {
        messageId,
      });
      return;
    }

    const texts = chunksWithoutEmbedding.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);
    for (let i = 0; i < chunksWithoutEmbedding.length; i++) {
      const vectorStr = `[${embeddings[i].join(",")}]`;
      await prisma.$queryRawUnsafe(
        `UPDATE "MessageChunk" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3`,
        vectorStr,
        chunksWithoutEmbedding[i].id,
        tenantId
      );
    }
    logger.info("processMessageEmbeddings: updated missing embeddings", {
      messageId,
      count: chunksWithoutEmbedding.length,
    });
    return;
  }

  for (let i = 0; i < textChunks.length; i++) {
    await prisma.$queryRawUnsafe(
      `INSERT INTO "MessageChunk" ("id", "content", "chunkIndex", "createdAt", "messageId", "conversationId", "tenantId", "userId", "projectId")
       VALUES (gen_random_uuid()::text, $1, $2, NOW(), $3, $4, $5, $6, $7)`,
      textChunks[i],
      i,
      messageId,
      conversationId,
      tenantId,
      userId,
      projectId
    );
  }

  const embeddings = await generateEmbeddings(textChunks);
  if (embeddings.length !== textChunks.length) {
    throw new Error(
      `Embedding count mismatch: got ${embeddings.length}, expected ${textChunks.length}`
    );
  }

  const newChunks = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "MessageChunk"
     WHERE "messageId" = $1 AND "tenantId" = $2
     ORDER BY "chunkIndex" ASC`,
    messageId,
    tenantId
  );

  for (let i = 0; i < newChunks.length; i++) {
    const vectorStr = `[${embeddings[i].join(",")}]`;
    await prisma.$queryRawUnsafe(
      `UPDATE "MessageChunk" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3`,
      vectorStr,
      newChunks[i].id,
      tenantId
    );
  }

  logger.info("processMessageEmbeddings: completed successfully", {
    messageId,
    embeddedChunks: newChunks.length,
  });
}

/**
 * Queue embedding processing for a message (async, non-blocking).
 * Errors are logged but not thrown.
 */
export function queueMessageEmbeddingProcessing(
  messageId: string,
  conversationId: string,
  tenantId: string,
  userId: string,
  projectId: string | null
): void {
  logger.info("Queueing message embedding processing", {
    messageId,
    conversationId,
    tenantId,
  });

  setImmediate(() => {
    processMessageEmbeddings(
      messageId,
      conversationId,
      tenantId,
      userId,
      projectId
    )
      .then(() => {
        logger.info("Message embedding processing completed successfully", {
          messageId,
          conversationId,
        });
      })
      .catch((error) => {
        logger.error(
          "MESSAGE EMBEDDING PROCESSING FAILED - semantic search will not work for this message",
          {
            messageId,
            conversationId,
            tenantId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }
        );
      });
  });
}

export type SearchConversationsResult = {
  conversationId: string;
  messageId: string;
  snippet: string;
  similarity: number;
  createdAt: Date;
};

/**
 * Search chat conversations using vector similarity + fulltext fallback.
 */
export async function searchConversations(
  tenantId: string,
  userId: string,
  queryText: string,
  options?: {
    limit?: number;
    threshold?: number;
    projectId?: string | null;
  }
): Promise<SearchConversationsResult[]> {
  const { limit = 10, threshold = 0.3, projectId } = options ?? {};

  const [embeddingResults, fulltextResults] = await Promise.all([
    (async () => {
      try {
        const queryEmbedding = await generateEmbedding(queryText);
        const vectorStr = `[${queryEmbedding.join(",")}]`;

        const conditions: string[] = [`mc."tenantId" = $2`, `mc."userId" = $3`];
        const params: (string | number | null)[] = [
          vectorStr,
          tenantId,
          userId,
        ];
        let nextParam = 4;
        if (projectId != null) {
          conditions.push(`mc."projectId" = $${nextParam++}`);
          params.push(projectId);
        }
        params.push(threshold);
        const thresholdParam = nextParam++;
        params.push(limit);
        const limitParam = nextParam++;

        const results = await prisma.$queryRawUnsafe<
          Array<{
            conversationId: string;
            messageId: string;
            content: string;
            similarity: number;
            createdAt: Date;
          }>
        >(
          `SELECT
             mc."conversationId",
             mc."messageId",
             mc."content",
             1 - (mc."embedding" <=> $1::vector) AS similarity,
             mc."createdAt"
           FROM "MessageChunk" mc
           WHERE ${conditions.join(" AND ")}
             AND mc."embedding" IS NOT NULL
             AND 1 - (mc."embedding" <=> $1::vector) > $${thresholdParam}
           ORDER BY mc."embedding" <=> $1::vector
           LIMIT $${limitParam}`,
          ...params
        );

        return results.map((r) => ({
          conversationId: r.conversationId,
          messageId: r.messageId,
          snippet:
            r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content,
          similarity: r.similarity,
          createdAt: r.createdAt,
        }));
      } catch (error) {
        logger.warn("Conversation embedding search failed, continuing with fulltext only", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })(),

    (async () => {
      const conditions: string[] = [
        `mc."tenantId" = $1`,
        `mc."userId" = $2`,
      ];
      const params: (string | number)[] = [tenantId, userId];
      let nextParam = 3;
      if (projectId != null) {
        conditions.push(`mc."projectId" = $${nextParam++}`);
        params.push(projectId);
      }
      const queryPattern = `%${queryText}%`;
      params.push(queryPattern);
      const patternParam = nextParam++;
      params.push(limit);
      const limitParam = nextParam++;

      const results = await prisma.$queryRawUnsafe<
        Array<{
          conversationId: string;
          messageId: string;
          content: string;
          createdAt: Date;
        }>
      >(
        `SELECT
           mc."conversationId",
           mc."messageId",
           mc."content",
           mc."createdAt"
         FROM "MessageChunk" mc
         WHERE ${conditions.join(" AND ")}
           AND mc."content" ILIKE $${patternParam}
         ORDER BY mc."createdAt" DESC
         LIMIT $${limitParam}`,
        ...params
      );

      return results.map((r) => ({
        conversationId: r.conversationId,
        messageId: r.messageId,
        snippet:
          r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content,
        similarity: 0.5,
        createdAt: r.createdAt,
      }));
    })(),
  ]);

  const embeddingKeys = new Set(
    embeddingResults.map((r) => `${r.conversationId}:${r.messageId}`)
  );
  const fulltextOnly = fulltextResults.filter(
    (r) => !embeddingKeys.has(`${r.conversationId}:${r.messageId}`)
  );
  const merged = [...embeddingResults, ...fulltextOnly].slice(0, limit);

  logger.info("searchConversations: complete", {
    embeddingCount: embeddingResults.length,
    fulltextCount: fulltextResults.length,
    mergedCount: merged.length,
  });

  return merged;
}
