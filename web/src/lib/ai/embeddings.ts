import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 20;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("OPENAI_API_KEY is not set - semantic search will not work. Embeddings cannot be generated.");
    throw new Error("OPENAI_API_KEY is not set - embeddings cannot be generated");
  }
  return new OpenAI({ apiKey });
}

/**
 * Generate embedding vector for a single text via OpenAI API.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in one API call (batch).
 * Returns an array of embeddings in the same order as the input texts.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const sorted = response.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      results.push(item.embedding);
    }
  }

  return results;
}

/**
 * Store embedding vector for a DocumentChunk via raw SQL (pgvector).
 * Kräver tenantId så att endast chunks i rätt tenant uppdateras (säkerhetsisolering).
 */
export async function storeChunkEmbedding(
  chunkId: string,
  embedding: number[],
  tenantId: string
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$queryRawUnsafe(
    `UPDATE "DocumentChunk" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3`,
    vectorStr,
    chunkId,
    tenantId
  );
}

/**
 * Process all chunks for a file: generate embeddings and store them.
 * Kräver tenantId för tenant-isolerad åtkomst (endast chunks i rätt tenant).
 * Använder raw SQL för att filtrera på embedding IS NULL (pgvector-fält stöds inte i Prisma WhereInput).
 *
 * Kastar fel om något går fel - INGA tysta fel!
 */
export async function processFileEmbeddings(
  fileId: string,
  tenantId: string
): Promise<void> {
  logger.info("processFileEmbeddings: starting", { fileId, tenantId });

  // First check if chunks exist at all for this file
  const allChunks = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "DocumentChunk" WHERE "fileId" = $1 AND "tenantId" = $2`,
    fileId,
    tenantId
  );

  if (allChunks.length === 0) {
    logger.warn("processFileEmbeddings: NO CHUNKS EXIST for file - OCR may have failed or chunks were never created", {
      fileId,
      tenantId,
    });
    return;
  }

  const chunks = await prisma.$queryRawUnsafe<
    Array<{ id: string; content: string }>
  >(
    `SELECT "id", "content" FROM "DocumentChunk"
     WHERE "fileId" = $1 AND "tenantId" = $2 AND "embedding" IS NULL`,
    fileId,
    tenantId
  );

  if (chunks.length === 0) {
    logger.info("processFileEmbeddings: all chunks already have embeddings", {
      fileId,
      totalChunks: allChunks.length,
    });
    return;
  }

  logger.info("processFileEmbeddings: generating embeddings", {
    fileId,
    chunksToEmbed: chunks.length,
    totalChunks: allChunks.length,
  });

  const texts = chunks.map((chunk) => chunk.content);
  const embeddings = await generateEmbeddings(texts);

  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}`);
  }

  for (let i = 0; i < chunks.length; i++) {
    await storeChunkEmbedding(chunks[i].id, embeddings[i], tenantId);
  }

  logger.info("processFileEmbeddings: completed successfully", {
    fileId,
    embeddedChunks: chunks.length,
  });
}

/**
 * Plaintext search in File metadata (name, userDescription, ocrText).
 * Returns results in same format as embedding search for consistency.
 */
async function searchFilesPlaintext(
  tenantId: string,
  projectId: string,
  queryText: string,
  limit: number
): Promise<
  Array<{
    id: string;
    content: string;
    similarity: number;
    page: number | null;
    fileId: string;
    fileName: string;
  }>
> {
  const files = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      userDescription: string | null;
      ocrText: string | null;
    }>
  >(
    `SELECT "id", "name", "userDescription", "ocrText"
     FROM "File"
     WHERE "tenantId" = $1
       AND "projectId" = $2
       AND (
         "name" ILIKE $3
         OR "userDescription" ILIKE $3
         OR "ocrText" ILIKE $3
       )
     LIMIT $4`,
    tenantId,
    projectId,
    `%${queryText}%`,
    limit
  );

  return files.map((file) => ({
    id: `plaintext-${file.id}`,
    content: file.userDescription || file.ocrText?.slice(0, 200) || file.name,
    similarity: 0.5,
    page: null,
    fileId: file.id,
    fileName: file.name,
  }));
}

/**
 * Cosine similarity search in DocumentChunk via pgvector.
 * Filtrerar alltid på tenantId och projectId (projektfiler) för multi-tenant-isolering.
 */
export async function searchDocuments(
  tenantId: string,
  projectId: string,
  queryText: string,
  options: { limit?: number; threshold?: number } = {}
): Promise<
  Array<{
    id: string;
    content: string;
    similarity: number;
    page: number | null;
    fileId: string;
    fileName: string;
  }>
> {
  const { limit = 10, threshold = 0.3 } = options;

  // Run both embedding and plaintext search in parallel
  const [embeddingResults, plaintextResults] = await Promise.all([
    // Embedding search with error handling
    (async () => {
      try {
        const queryEmbedding = await generateEmbedding(queryText);
        const vectorStr = `[${queryEmbedding.join(",")}]`;

        return await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            content: string;
            similarity: number;
            page: number | null;
            fileId: string;
            fileName: string;
          }>
        >(
          `SELECT
             dc."id",
             dc."content",
             1 - (dc."embedding" <=> $1::vector) AS similarity,
             dc."page",
             dc."fileId",
             f."name" AS "fileName"
           FROM "DocumentChunk" dc
           JOIN "File" f ON f."id" = dc."fileId"
           WHERE dc."tenantId" = $2
             AND dc."projectId" = $3
             AND dc."embedding" IS NOT NULL
             AND 1 - (dc."embedding" <=> $1::vector) > $4
           ORDER BY dc."embedding" <=> $1::vector
           LIMIT $5`,
          vectorStr,
          tenantId,
          projectId,
          threshold,
          limit
        );
      } catch (error) {
        logger.warn("Embedding search failed, continuing with plaintext only", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })(),
    // Plaintext search
    searchFilesPlaintext(tenantId, projectId, queryText, limit),
  ]);

  // Merge results: embedding first, then plaintext-only (deduplicate on fileId)
  const embeddingFileIds = new Set(embeddingResults.map((r) => r.fileId));
  const plaintextOnly = plaintextResults.filter((r) => !embeddingFileIds.has(r.fileId));

  return [...embeddingResults, ...plaintextOnly].slice(0, limit);
}

/**
 * Plaintext search in File metadata for global search (multiple projects + personal files).
 * Returns results in same format as embedding search for consistency.
 */
async function searchFilesPlaintextGlobal(
  tenantId: string,
  accessibleProjectIds: string[],
  queryText: string,
  limit: number,
  userId?: string
): Promise<
  Array<{
    id: string;
    content: string;
    similarity: number;
    page: number | null;
    fileId: string;
    fileName: string;
    projectId: string | null;
    projectName: string | null;
  }>
> {
  const hasProjects = accessibleProjectIds.length > 0;
  const hasUserId = !!userId;

  if (!hasProjects && !hasUserId) {
    return [];
  }

  // Build dynamic SQL query for scope filtering
  let nextParam = 3; // $1=tenantId, $2=queryPattern, then dynamic params
  const scopeConditions: string[] = [];
  const params: (string | number)[] = [tenantId, `%${queryText}%`];

  if (hasProjects) {
    const projectPlaceholders = accessibleProjectIds.map(() => `$${nextParam++}`).join(", ");
    scopeConditions.push(`f."projectId" IN (${projectPlaceholders})`);
    params.push(...accessibleProjectIds);
  }

  if (hasUserId) {
    scopeConditions.push(`(f."projectId" IS NULL AND f."uploadedById" = $${nextParam++})`);
    params.push(userId!);
  }

  params.push(limit);
  const limitParam = `$${nextParam++}`;

  const files = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      userDescription: string | null;
      ocrText: string | null;
      projectId: string | null;
      projectName: string | null;
    }>
  >(
    `SELECT
       f."id",
       f."name",
       f."userDescription",
       f."ocrText",
       f."projectId",
       p."name" AS "projectName"
     FROM "File" f
     LEFT JOIN "Project" p ON p."id" = f."projectId"
     WHERE f."tenantId" = $1
       AND (${scopeConditions.join(" OR ")})
       AND (
         f."name" ILIKE $2
         OR f."userDescription" ILIKE $2
         OR f."ocrText" ILIKE $2
       )
     LIMIT ${limitParam}`,
    ...params
  );

  return files.map((file) => ({
    id: `plaintext-${file.id}`,
    content: file.userDescription || file.ocrText?.slice(0, 200) || file.name,
    similarity: 0.5,
    page: null,
    fileId: file.id,
    fileName: file.name,
    projectId: file.projectId,
    projectName: file.projectName,
  }));
}

/**
 * Search across ALL projects the user has access to AND personal files (for global search).
 * Filtrerar alltid på tenantId och lista av tillgängliga projectIds + userId för personliga filer.
 */
export async function searchDocumentsGlobal(
  tenantId: string,
  accessibleProjectIds: string[],
  queryText: string,
  options: { limit?: number; threshold?: number; userId?: string } = {}
): Promise<
  Array<{
    id: string;
    content: string;
    similarity: number;
    page: number | null;
    fileId: string;
    fileName: string;
    projectId: string | null;
    projectName: string | null;
  }>
> {
  const hasProjects = accessibleProjectIds.length > 0;
  const hasUserId = !!options.userId;

  if (!hasProjects && !hasUserId) {
    logger.warn("searchDocumentsGlobal: no project IDs and no userId");
    return [];
  }

  const { limit = 5, threshold = 0.3, userId } = options;

  logger.info("searchDocumentsGlobal: starting search", {
    tenantId,
    queryText: queryText.slice(0, 100),
    projectIdCount: accessibleProjectIds.length,
    accessibleProjectIds,
    userId: userId ?? null,
    threshold,
    limit,
  });

  // Run both embedding and plaintext search in parallel
  const [embeddingResults, plaintextResults] = await Promise.all([
    // Embedding search with error handling
    (async () => {
      try {
        const queryEmbedding = await generateEmbedding(queryText);
        const vectorStr = `[${queryEmbedding.join(",")}]`;

        // Build dynamic WHERE clause to include both project chunks AND personal chunks
        // Parameters: $1=vector, $2=tenantId, $3=threshold, $4=limit, then dynamic params
        let nextParam = 5;
        const scopeConditions: string[] = [];

        if (hasProjects) {
          const projectPlaceholders = accessibleProjectIds
            .map(() => `$${nextParam++}`)
            .join(", ");
          scopeConditions.push(`dc."projectId" IN (${projectPlaceholders})`);
        }

        if (hasUserId) {
          scopeConditions.push(`(dc."projectId" IS NULL AND dc."userId" = $${nextParam++})`);
        }

        const scopeWhere = scopeConditions.join(" OR ");

        // Build parameter array
        const dynamicParams: (string | number)[] = [
          vectorStr,
          tenantId,
          threshold,
          limit,
          ...accessibleProjectIds,
        ];
        if (hasUserId) {
          dynamicParams.push(userId!);
        }

        // Debug: count total chunks in scope
        const debugParams: (string | number)[] = [tenantId, ...accessibleProjectIds];
        if (hasUserId) debugParams.push(userId!);

        const debugPlaceholderStart = 2;
        let debugNextParam = debugPlaceholderStart;
        const debugScopeConditions: string[] = [];
        if (hasProjects) {
          const dp = accessibleProjectIds.map(() => `$${debugNextParam++}`).join(", ");
          debugScopeConditions.push(`"projectId" IN (${dp})`);
        }
        if (hasUserId) {
          debugScopeConditions.push(`("projectId" IS NULL AND "userId" = $${debugNextParam++})`);
        }

        const chunkStats = await prisma.$queryRawUnsafe<
          Array<{ total: bigint; with_embedding: bigint }>
        >(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "embedding" IS NOT NULL) AS with_embedding
           FROM "DocumentChunk"
           WHERE "tenantId" = $1
             AND (${debugScopeConditions.join(" OR ")})`,
          ...debugParams
        );

        logger.info("searchDocumentsGlobal: chunk stats in scope", {
          total: Number(chunkStats[0]?.total ?? 0),
          withEmbedding: Number(chunkStats[0]?.with_embedding ?? 0),
        });

        const results = await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            content: string;
            similarity: number;
            page: number | null;
            fileId: string;
            fileName: string;
            projectId: string | null;
            projectName: string | null;
          }>
        >(
          `SELECT
             dc."id",
             dc."content",
             1 - (dc."embedding" <=> $1::vector) AS similarity,
             dc."page",
             dc."fileId",
             f."name" AS "fileName",
             dc."projectId",
             p."name" AS "projectName"
           FROM "DocumentChunk" dc
           JOIN "File" f ON f."id" = dc."fileId"
           LEFT JOIN "Project" p ON p."id" = dc."projectId"
           WHERE dc."tenantId" = $2
             AND (${scopeWhere})
             AND dc."embedding" IS NOT NULL
             AND 1 - (dc."embedding" <=> $1::vector) > $3
           ORDER BY dc."embedding" <=> $1::vector
           LIMIT $4`,
          ...dynamicParams
        );

        logger.info("searchDocumentsGlobal: embedding search complete", {
          resultCount: results.length,
          topSimilarities: results.slice(0, 3).map((r) => ({
            fileName: r.fileName,
            similarity: r.similarity,
            projectName: r.projectName,
          })),
        });

        return results;
      } catch (error) {
        logger.warn("Embedding search failed in global search, continuing with plaintext only", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })(),
    // Plaintext search
    searchFilesPlaintextGlobal(tenantId, accessibleProjectIds, queryText, limit, userId),
  ]);

  // Merge results: embedding first, then plaintext-only (deduplicate on fileId)
  const embeddingFileIds = new Set(embeddingResults.map((r) => r.fileId));
  const plaintextOnly = plaintextResults.filter((r) => !embeddingFileIds.has(r.fileId));

  const finalResults = [...embeddingResults, ...plaintextOnly].slice(0, limit);

  logger.info("searchDocumentsGlobal: search complete", {
    embeddingCount: embeddingResults.length,
    plaintextCount: plaintextResults.length,
    plaintextOnlyCount: plaintextOnly.length,
    finalCount: finalResults.length,
  });

  return finalResults;
}

/**
 * Queue embedding processing for a file in the background.
 * Kräver tenantId för tenant-isolerad bearbetning.
 *
 * OBS: Fel loggas men kastas inte vidare (bakgrundsprocess).
 * Kontrollera server-loggar för "embedding processing failed".
 */
export function queueEmbeddingProcessing(
  fileId: string,
  tenantId: string
): void {
  logger.info("Queueing embedding processing", { fileId, tenantId });

  processFileEmbeddings(fileId, tenantId)
    .then(() => {
      logger.info("Embedding processing completed successfully", { fileId, tenantId });
    })
    .catch((error) => {
      // KRITISKT: Detta fel innebär att semantisk sökning INTE kommer fungera för denna fil!
      logger.error("EMBEDDING PROCESSING FAILED - semantic search will not work for this file", {
        fileId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
}

/**
 * Check if embedding generation is configured (OPENAI_API_KEY is set).
 * Useful for showing warnings in UI when semantic search won't work.
 */
export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
