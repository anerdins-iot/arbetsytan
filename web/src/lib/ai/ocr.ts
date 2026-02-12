import { Mistral } from "@mistralai/mistralai";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, createPresignedDownloadUrl } from "@/lib/minio";
import { tenantDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queueEmbeddingProcessing } from "@/lib/ai/embeddings";

import type { Document } from "@mistralai/mistralai/models/components/ocrrequest";

const OCR_MODEL = "mistral-ocr-latest";

/**
 * Target chunk size in characters (roughly 500–1000 tokens).
 * A token ~4 chars on average, so 2000–4000 chars.
 */
const CHUNK_MIN_CHARS = 2000;
const CHUNK_MAX_CHARS = 4000;

/** File types eligible for OCR processing. */
const OCR_ELIGIBLE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isOcrEligible(fileType: string, fileName: string): boolean {
  if (OCR_ELIGIBLE_TYPES.has(fileType)) return true;
  return /\.(pdf|jpe?g|png|webp)$/i.test(fileName);
}

function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }
  return new Mistral({ apiKey });
}

async function fetchFileFromMinIO(bucket: string, key: string): Promise<Buffer> {
  const response = await minioClient.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  if (!response.Body) {
    throw new Error("Empty response body from MinIO");
  }
  const chunks: Uint8Array[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

type OcrPage = {
  index: number;
  markdown: string;
};

type OcrResult = {
  pages: OcrPage[];
  fullText: string;
};

function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/");
}

/**
 * Builds the document parameter for Mistral OCR.
 * - Images: base64 data URI via image_url type
 * - PDFs: presigned MinIO URL via document_url type
 */
async function buildOcrDocument(
  bucket: string,
  key: string,
  fileType: string
): Promise<Document> {
  if (isImageType(fileType)) {
    const fileBuffer = await fetchFileFromMinIO(bucket, key);
    const base64 = fileBuffer.toString("base64");
    const mimeType = fileType || "image/jpeg";
    return {
      type: "image_url",
      imageUrl: `data:${mimeType};base64,${base64}`,
    };
  }

  // For PDFs: generate a presigned URL for Mistral to fetch
  const presignedUrl = await createPresignedDownloadUrl({
    bucket,
    key,
    expiresInSeconds: 60 * 30,
  });
  return {
    type: "document_url",
    documentUrl: presignedUrl,
  };
}

/**
 * Runs Mistral OCR on a file stored in MinIO.
 * Returns per-page markdown text and the full concatenated text.
 */
async function runOcr(bucket: string, key: string, fileType: string): Promise<OcrResult> {
  const mistral = getMistralClient();
  const document = await buildOcrDocument(bucket, key, fileType);

  const response = await mistral.ocr.process({
    model: OCR_MODEL,
    document,
    includeImageBase64: false,
  });

  const pages: OcrPage[] = (response.pages ?? []).map((page) => ({
    index: page.index,
    markdown: page.markdown,
  }));

  const fullText = pages.map((p) => p.markdown).join("\n\n---\n\n");

  return { pages, fullText };
}

/**
 * Returns OCR text for a file. Uses cached ocrText if present, otherwise runs OCR
 * and updates the file record. For use by AI document-analysis tool.
 * Caller must have validated project access (requireProject).
 */
export async function getOcrTextForFile(params: {
  fileId: string;
  projectId: string;
  tenantId: string;
}): Promise<{ fullText: string } | { error: string }> {
  const { fileId, projectId, tenantId } = params;
  const db = tenantDb(tenantId);

  const file = await db.file.findFirst({
    where: { id: fileId, projectId },
    select: { id: true, bucket: true, key: true, type: true, name: true, ocrText: true },
  });

  if (!file) {
    return { error: "FILE_NOT_FOUND" };
  }

  if (file.ocrText && file.ocrText.trim()) {
    return { fullText: file.ocrText };
  }

  if (!isOcrEligible(file.type, file.name)) {
    return { error: "FILE_TYPE_NOT_OCR_ELIGIBLE" };
  }

  if (!process.env.MISTRAL_API_KEY) {
    return { error: "OCR_NOT_CONFIGURED" };
  }

  try {
    const result = await runOcr(file.bucket, file.key, file.type);
    if (!result.fullText.trim()) {
      return { fullText: "(OCR returnerade ingen text.)" };
    }
    await db.file.update({
      where: { id: file.id },
      data: { ocrText: result.fullText },
    });
    return { fullText: result.fullText };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR_FAILED";
    logger.error("OCR failed for analysis", { fileId, error: message });
    return { error: message };
  }
}

type TextChunk = {
  content: string;
  page: number | null;
  position: number;
};

/**
 * Splits text into chunks of roughly 500–1000 tokens (2000–4000 chars).
 * Tries to break at paragraph boundaries.
 */
function chunkText(pages: OcrPage[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let position = 0;

  for (const page of pages) {
    const text = page.markdown.trim();
    if (!text) continue;

    const paragraphs = text.split(/\n{2,}/);
    let buffer = "";

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      if (buffer.length + trimmed.length + 2 > CHUNK_MAX_CHARS && buffer.length >= CHUNK_MIN_CHARS) {
        chunks.push({
          content: buffer.trim(),
          page: page.index,
          position,
        });
        position++;
        buffer = "";
      }

      buffer += (buffer ? "\n\n" : "") + trimmed;
    }

    if (buffer.trim()) {
      if (buffer.length < CHUNK_MIN_CHARS && chunks.length > 0 && chunks[chunks.length - 1].page === page.index) {
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk.content.length + buffer.length + 2 <= CHUNK_MAX_CHARS) {
          lastChunk.content += "\n\n" + buffer.trim();
          continue;
        }
      }
      chunks.push({
        content: buffer.trim(),
        page: page.index,
        position,
      });
      position++;
    }
  }

  return chunks;
}

/**
 * Full OCR pipeline: OCR the file, save ocrText, chunk and save DocumentChunks.
 * This is designed to be called after file upload completes.
 */
export async function processFileOcr(params: {
  fileId: string;
  projectId: string;
  tenantId: string;
  bucket: string;
  key: string;
  fileType: string;
  fileName: string;
}): Promise<{ success: true; chunkCount: number } | { success: false; error: string }> {
  const { fileId, projectId, tenantId, bucket, key, fileType, fileName } = params;

  if (!isOcrEligible(fileType, fileName)) {
    return { success: true, chunkCount: 0 };
  }

  if (!process.env.MISTRAL_API_KEY) {
    logger.warn("MISTRAL_API_KEY not set — skipping OCR for file", { fileId });
    return { success: true, chunkCount: 0 };
  }

  try {
    const ocrResult = await runOcr(bucket, key, fileType);

    if (!ocrResult.fullText.trim()) {
      logger.info("OCR returned empty text for file", { fileId });
      return { success: true, chunkCount: 0 };
    }

    const db = tenantDb(tenantId);

    await db.file.update({
      where: { id: fileId },
      data: { ocrText: ocrResult.fullText },
    });

    const textChunks = chunkText(ocrResult.pages);

    if (textChunks.length > 0) {
      await db.documentChunk.deleteMany({
        where: { fileId },
      });

      for (const chunk of textChunks) {
        await db.documentChunk.create({
          data: {
            content: chunk.content,
            page: chunk.page,
            metadata: { position: chunk.position, source: "ocr" },
            fileId,
            projectId,
          },
        });
      }

      if (process.env.OPENAI_API_KEY) {
        queueEmbeddingProcessing(fileId);
      } else {
        logger.warn("OPENAI_API_KEY not set — skipping embedding queue for file", { fileId });
      }
    }

    logger.info("OCR completed for file", { fileId, chunkCount: textChunks.length });
    return { success: true, chunkCount: textChunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR_FAILED";
    logger.error("OCR failed for file", { fileId, error: message });
    return { success: false, error: message };
  }
}
