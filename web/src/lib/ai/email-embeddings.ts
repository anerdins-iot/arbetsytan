/**
 * Email embedding processing and search.
 * Uses pgvector for semantic search on email content via EmailChunk.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateEmbedding, generateEmbeddings } from "./embeddings";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

/**
 * Split email content into overlapping chunks for embedding.
 */
function chunkEmailContent(subject: string, body: string): string[] {
  const fullText = `${subject}\n\n${body}`;

  if (fullText.length <= CHUNK_SIZE) {
    return [fullText];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < fullText.length) {
    const end = Math.min(start + CHUNK_SIZE, fullText.length);
    chunks.push(fullText.slice(start, end));

    if (end >= fullText.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Process embeddings for an email.
 * Creates EmailChunk records and generates + stores embedding vectors.
 */
export async function processEmailEmbeddings(
  emailLogId: string,
  tenantId: string
): Promise<void> {
  logger.info("processEmailEmbeddings: starting", { emailLogId, tenantId });

  // 1. Fetch EmailLog
  const emailLog = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      subject: string;
      body: string;
      userId: string;
      projectId: string | null;
    }>
  >(
    `SELECT "id", "subject", "body", "userId", "projectId"
     FROM "EmailLog"
     WHERE "id" = $1 AND "tenantId" = $2`,
    emailLogId,
    tenantId
  );

  if (emailLog.length === 0) {
    logger.warn("processEmailEmbeddings: email not found", { emailLogId, tenantId });
    return;
  }

  const email = emailLog[0];

  // 2. Split into chunks
  const textChunks = chunkEmailContent(email.subject, email.body);

  if (textChunks.length === 0) {
    logger.warn("processEmailEmbeddings: no content to chunk", { emailLogId });
    return;
  }

  // 3. Check if chunks already exist
  const existingChunks = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "EmailChunk" WHERE "emailLogId" = $1 AND "tenantId" = $2`,
    emailLogId,
    tenantId
  );

  if (existingChunks.length > 0) {
    logger.info("processEmailEmbeddings: chunks already exist, checking for missing embeddings", {
      emailLogId,
      existingCount: existingChunks.length,
    });

    // Process any chunks missing embeddings
    const chunksWithoutEmbedding = await prisma.$queryRawUnsafe<
      Array<{ id: string; content: string }>
    >(
      `SELECT "id", "content" FROM "EmailChunk"
       WHERE "emailLogId" = $1 AND "tenantId" = $2 AND "embedding" IS NULL`,
      emailLogId,
      tenantId
    );

    if (chunksWithoutEmbedding.length === 0) {
      logger.info("processEmailEmbeddings: all chunks already have embeddings", { emailLogId });
      return;
    }

    const texts = chunksWithoutEmbedding.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < chunksWithoutEmbedding.length; i++) {
      const vectorStr = `[${embeddings[i].join(",")}]`;
      await prisma.$queryRawUnsafe(
        `UPDATE "EmailChunk" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3`,
        vectorStr,
        chunksWithoutEmbedding[i].id,
        tenantId
      );
    }

    logger.info("processEmailEmbeddings: updated missing embeddings", {
      emailLogId,
      count: chunksWithoutEmbedding.length,
    });
    return;
  }

  // 4. Create EmailChunk records
  for (let i = 0; i < textChunks.length; i++) {
    await prisma.$queryRawUnsafe(
      `INSERT INTO "EmailChunk" ("id", "content", "chunkIndex", "emailLogId", "tenantId", "projectId", "userId", "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())`,
      textChunks[i],
      i,
      emailLogId,
      tenantId,
      email.projectId,
      email.userId
    );
  }

  logger.info("processEmailEmbeddings: created chunks", {
    emailLogId,
    chunkCount: textChunks.length,
  });

  // 5. Generate embeddings
  const embeddings = await generateEmbeddings(textChunks);

  if (embeddings.length !== textChunks.length) {
    throw new Error(
      `Embedding count mismatch: got ${embeddings.length}, expected ${textChunks.length}`
    );
  }

  // 6. Fetch newly created chunks and store embeddings
  const newChunks = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "EmailChunk"
     WHERE "emailLogId" = $1 AND "tenantId" = $2
     ORDER BY "chunkIndex" ASC`,
    emailLogId,
    tenantId
  );

  for (let i = 0; i < newChunks.length; i++) {
    const vectorStr = `[${embeddings[i].join(",")}]`;
    await prisma.$queryRawUnsafe(
      `UPDATE "EmailChunk" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3`,
      vectorStr,
      newChunks[i].id,
      tenantId
    );
  }

  logger.info("processEmailEmbeddings: completed successfully", {
    emailLogId,
    embeddedChunks: newChunks.length,
  });
}

/**
 * Queue embedding processing for an email (async, non-blocking).
 * Errors are logged but not thrown.
 */
export function queueEmailEmbeddingProcessing(
  emailLogId: string,
  tenantId: string
): void {
  logger.info("Queueing email embedding processing", { emailLogId, tenantId });

  processEmailEmbeddings(emailLogId, tenantId)
    .then(() => {
      logger.info("Email embedding processing completed successfully", {
        emailLogId,
        tenantId,
      });
    })
    .catch((error) => {
      logger.error(
        "EMAIL EMBEDDING PROCESSING FAILED - semantic search will not work for this email",
        {
          emailLogId,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }
      );
    });
}

/**
 * Search emails using vector similarity + fulltext fallback.
 */
export async function searchEmails(
  tenantId: string,
  queryText: string,
  options?: {
    limit?: number;
    threshold?: number;
    projectId?: string;
    userId?: string;
  }
): Promise<
  Array<{
    id: string;
    subject: string;
    from: string;
    to: string[];
    bodyPreview: string;
    similarity: number;
    createdAt: Date;
    direction: "INBOUND" | "OUTBOUND";
    /** Set when this email is part of a conversation thread (EmailLog linked to EmailMessage). */
    conversationId: string | null;
  }>
> {
  const { limit = 10, threshold = 0.3, projectId, userId } = options ?? {};

  // Run embedding search and fulltext search in parallel
  const [embeddingResults, fulltextResults] = await Promise.all([
    // Embedding search
    (async () => {
      try {
        const queryEmbedding = await generateEmbedding(queryText);
        const vectorStr = `[${queryEmbedding.join(",")}]`;

        // Build dynamic scope filter
        const conditions: string[] = [`ec."tenantId" = $2`];
        const params: (string | number)[] = [vectorStr, tenantId];
        let nextParam = 3;

        if (projectId) {
          conditions.push(`ec."projectId" = $${nextParam++}`);
          params.push(projectId);
        }
        if (userId) {
          conditions.push(`ec."userId" = $${nextParam++}`);
          params.push(userId);
        }

        params.push(threshold);
        const thresholdParam = nextParam++;
        params.push(limit);
        const limitParam = nextParam++;

        const results = await prisma.$queryRawUnsafe<
          Array<{
            emailLogId: string;
            subject: string;
            from: string;
            to: unknown;
            body: string;
            similarity: number;
            createdAt: Date;
            direction: "INBOUND" | "OUTBOUND";
            conversationId: string | null;
          }>
        >(
          `SELECT DISTINCT ON (el."id")
             el."id" AS "emailLogId",
             el."subject",
             el."from",
             el."to",
             el."body",
             1 - (ec."embedding" <=> $1::vector) AS similarity,
             el."createdAt",
             el."direction",
             em."conversationId" AS "conversationId"
           FROM "EmailChunk" ec
           JOIN "EmailLog" el ON el."id" = ec."emailLogId"
           LEFT JOIN "EmailMessage" em ON em."emailLogId" = el."id"
           WHERE ${conditions.join(" AND ")}
             AND ec."embedding" IS NOT NULL
             AND 1 - (ec."embedding" <=> $1::vector) > $${thresholdParam}
           ORDER BY el."id", ec."embedding" <=> $1::vector
           LIMIT $${limitParam}`,
          ...params
        );

        return results.map((r) => ({
          id: r.emailLogId,
          subject: r.subject,
          from: r.from,
          to: (Array.isArray(r.to) ? r.to : []) as string[],
          bodyPreview:
            r.body.length > 200 ? r.body.slice(0, 200) + "..." : r.body,
          similarity: r.similarity,
          createdAt: r.createdAt,
          direction: r.direction,
          conversationId: r.conversationId ?? null,
        }));
      } catch (error) {
        logger.warn("Email embedding search failed, continuing with fulltext only", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })(),

    // Fulltext search
    (async () => {
      const conditions: string[] = [`el."tenantId" = $1`];
      const params: (string | number)[] = [tenantId];
      let nextParam = 2;

      if (projectId) {
        conditions.push(`el."projectId" = $${nextParam++}`);
        params.push(projectId);
      }
      if (userId) {
        conditions.push(`el."userId" = $${nextParam++}`);
        params.push(userId);
      }

      const queryPattern = `%${queryText}%`;
      params.push(queryPattern);
      const patternParam = nextParam++;
      params.push(limit);
      const limitParam = nextParam++;

      const results = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          subject: string;
          from: string;
          to: unknown;
          body: string;
          createdAt: Date;
          direction: "INBOUND" | "OUTBOUND";
          conversationId: string | null;
        }>
      >(
        `SELECT
           el."id",
           el."subject",
           el."from",
           el."to",
           el."body",
           el."createdAt",
           el."direction",
           em."conversationId" AS "conversationId"
         FROM "EmailLog" el
         LEFT JOIN "EmailMessage" em ON em."emailLogId" = el."id"
         WHERE ${conditions.join(" AND ")}
           AND (
             el."subject" ILIKE $${patternParam}
             OR el."body" ILIKE $${patternParam}
             OR el."from" ILIKE $${patternParam}
           )
         ORDER BY el."createdAt" DESC
         LIMIT $${limitParam}`,
        ...params
      );

      return results.map((r) => ({
        id: r.id,
        subject: r.subject,
        from: r.from,
        to: (Array.isArray(r.to) ? r.to : []) as string[],
        bodyPreview:
          r.body.length > 200 ? r.body.slice(0, 200) + "..." : r.body,
        similarity: 0.5,
        createdAt: r.createdAt,
        direction: r.direction,
        conversationId: r.conversationId ?? null,
      }));
    })(),
  ]);

  // Merge: embedding results first, then fulltext-only (deduplicate on emailLogId)
  const embeddingIds = new Set(embeddingResults.map((r) => r.id));
  const fulltextOnly = fulltextResults.filter((r) => !embeddingIds.has(r.id));

  const merged = [...embeddingResults, ...fulltextOnly].slice(0, limit);

  logger.info("searchEmails: complete", {
    embeddingCount: embeddingResults.length,
    fulltextCount: fulltextResults.length,
    mergedCount: merged.length,
  });

  return merged;
}
