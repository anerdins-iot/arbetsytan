import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 20;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
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
 */
export async function processFileEmbeddings(
  fileId: string,
  tenantId: string
): Promise<void> {
  const chunks = await prisma.$queryRawUnsafe<
    Array<{ id: string; content: string }>
  >(
    `SELECT "id", "content" FROM "DocumentChunk"
     WHERE "fileId" = $1 AND "tenantId" = $2 AND "embedding" IS NULL`,
    fileId,
    tenantId
  );

  if (chunks.length === 0) {
    logger.info("No chunks to embed for file", { fileId });
    return;
  }

  logger.info("Processing embeddings for file", {
    fileId,
    chunkCount: chunks.length,
  });

  const texts = chunks.map((chunk) => chunk.content);
  const embeddings = await generateEmbeddings(texts);

  for (let i = 0; i < chunks.length; i++) {
    await storeChunkEmbedding(chunks[i].id, embeddings[i], tenantId);
  }

  logger.info("Embeddings stored for file", {
    fileId,
    chunkCount: chunks.length,
  });
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
  const { limit = 10, threshold = 0.5 } = options;

  const queryEmbedding = await generateEmbedding(queryText);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<
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

  return results;
}

/**
 * Search across ALL projects the user has access to (for global search).
 * Filtrerar alltid på tenantId och lista av tillgängliga projectIds.
 */
export async function searchDocumentsGlobal(
  tenantId: string,
  accessibleProjectIds: string[],
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
    projectId: string;
    projectName: string;
  }>
> {
  if (accessibleProjectIds.length === 0) return [];

  const { limit = 5, threshold = 0.5 } = options;

  const queryEmbedding = await generateEmbedding(queryText);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const placeholders = accessibleProjectIds
    .map((_, idx) => `$${idx + 5}`)
    .join(", ");

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      content: string;
      similarity: number;
      page: number | null;
      fileId: string;
      fileName: string;
      projectId: string;
      projectName: string;
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
       AND dc."projectId" IN (${placeholders})
       AND dc."embedding" IS NOT NULL
       AND 1 - (dc."embedding" <=> $1::vector) > $3
     ORDER BY dc."embedding" <=> $1::vector
     LIMIT $4`,
    vectorStr,
    tenantId,
    threshold,
    limit,
    ...accessibleProjectIds
  );

  return results;
}

/**
 * Queue embedding processing for a file in the background.
 * Kräver tenantId för tenant-isolerad bearbetning.
 */
export function queueEmbeddingProcessing(
  fileId: string,
  tenantId: string
): void {
  processFileEmbeddings(fileId, tenantId).catch((error) => {
    logger.error("Background embedding processing failed", {
      fileId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
