import { Mistral } from "@mistralai/mistralai";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, createPresignedDownloadUrl } from "@/lib/minio";
import { tenantDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queueEmbeddingProcessing } from "@/lib/ai/embeddings";
import {
  processExcel,
  processWord,
  processCSV,
  detectFileType,
  isProcessableFile,
} from "./file-processors";
import { queueFileAnalysis } from "./queue-file-analysis";

import type { Document } from "@mistralai/mistralai/models/components/ocrrequest";

const OCR_MODEL = "mistral-ocr-latest";

/**
 * Target chunk size in characters (roughly 500–1000 tokens).
 * A token ~4 chars on average, so 2000–4000 chars.
 */
const CHUNK_MIN_CHARS = 2000;
const CHUNK_MAX_CHARS = 4000;

/** File types eligible for OCR/processing (PDF, images, Office, CSV). */
const PROCESSABLE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
]);

function isOcrEligible(fileType: string, fileName: string): boolean {
  if (PROCESSABLE_TYPES.has(fileType)) return true;
  return /\.(pdf|jpe?g|png|webp|gif|xlsx?|docx?|csv)$/i.test(fileName);
}

function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }
  return new Mistral({ apiKey });
}

export async function fetchFileFromMinIO(bucket: string, key: string): Promise<Buffer> {
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
 * Routes to the appropriate processor and returns extracted text + source label.
 * Used by processFileOcr / processPersonalFileOcr for all processable file types.
 */
export async function processFileContent(
  bucket: string,
  key: string,
  fileType: string,
  fileName: string
): Promise<{ text: string; source: string }> {
  const detectedType = detectFileType(fileType, fileName);
  const buffer = await fetchFileFromMinIO(bucket, key);

  switch (detectedType) {
    case "excel":
      return { text: await processExcel(buffer), source: "excel-parser" };
    case "word":
      return { text: await processWord(buffer), source: "word-parser" };
    case "csv":
      return { text: await processCSV(buffer), source: "csv-parser" };
    case "image": {
      // Run OCR only to extract text - vision analysis is done separately in background
      const ocrResult = await runOcr(bucket, key, fileType);
      return { text: ocrResult.fullText, source: "ocr" };
    }
    case "pdf": {
      const pdfResult = await runOcr(bucket, key, fileType);
      return { text: pdfResult.fullText, source: "ocr" };
    }
    default:
      return { text: "", source: "unsupported" };
  }
}

/**
 * Returns OCR text for a file. Uses cached ocrText if present, otherwise runs
 * processFileContent (OCR or parser). For use by AI document-analysis tool.
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

  if (!isProcessableFile(file.type, file.name)) {
    return { error: "FILE_TYPE_NOT_OCR_ELIGIBLE" };
  }

  const detected = detectFileType(file.type, file.name);
  if (
    (detected === "pdf" || detected === "image") &&
    !process.env.MISTRAL_API_KEY
  ) {
    return { error: "OCR_NOT_CONFIGURED" };
  }

  try {
    const { text } = await processFileContent(
      file.bucket,
      file.key,
      file.type,
      file.name
    );
    if (!text.trim()) {
      return { fullText: "(Ingen text kunde extraheras.)" };
    }
    await db.file.update({
      where: { id: file.id },
      data: { ocrText: text },
    });
    return { fullText: text };
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
 * Full file processing pipeline: extract text (OCR or parser), save ocrText,
 * chunk and save DocumentChunks. Supports PDF, images, Excel, Word, CSV.
 * Called after file upload completes.
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

  if (!isProcessableFile(fileType, fileName)) {
    return { success: true, chunkCount: 0 };
  }

  const detected = detectFileType(fileType, fileName);
  if (
    (detected === "pdf" || detected === "image") &&
    !process.env.MISTRAL_API_KEY
  ) {
    logger.warn("MISTRAL_API_KEY not set — skipping OCR for file", { fileId });
    return { success: true, chunkCount: 0 };
  }

  try {
    const { text, source } = await processFileContent(
      bucket,
      key,
      fileType,
      fileName
    );

    if (!text.trim()) {
      logger.info("No text extracted for file", { fileId });
      return { success: true, chunkCount: 0 };
    }

    const db = tenantDb(tenantId);

    await db.file.update({
      where: { id: fileId },
      data: { ocrText: text },
    });

    const pages: OcrPage[] = [{ index: 0, markdown: text }];
    const textChunks = chunkText(pages);

    logger.info("processFileOcr: chunking result", {
      fileId,
      projectId,
      tenantId,
      textLength: text.length,
      chunkCount: textChunks.length,
    });

    if (textChunks.length > 0) {
      await db.documentChunk.deleteMany({
        where: { fileId },
      });

      for (const chunk of textChunks) {
        await db.documentChunk.create({
          data: {
            content: chunk.content,
            page: chunk.page,
            metadata: { position: chunk.position, source },
            fileId,
            tenantId,
            projectId,
          },
        });
      }

      logger.info("processFileOcr: chunks created in database", {
        fileId,
        chunkCount: textChunks.length,
      });

      if (process.env.OPENAI_API_KEY) {
        queueEmbeddingProcessing(fileId, tenantId);
      } else {
        logger.warn("OPENAI_API_KEY not set — skipping embedding queue for file", {
          fileId,
        });
      }
    } else {
      logger.warn("processFileOcr: NO CHUNKS CREATED - text too short or chunking failed", {
        fileId,
        textLength: text.length,
      });
    }

    // Trigger background file analysis (label + AI description + embeddings)
    const fileWithUser = await db.file.findFirst({
      where: { id: fileId },
      select: { uploadedById: true },
    });
    if (fileWithUser?.uploadedById) {
      queueFileAnalysis({
        fileId,
        fileName,
        fileType,
        bucket,
        key,
        tenantId,
        projectId,
        userId: fileWithUser.uploadedById,
        ocrText: text,
        userDescription: "",
      });
    }

    logger.info("processFileOcr: completed", {
      fileId,
      chunkCount: textChunks.length,
      source,
    });
    return { success: true, chunkCount: textChunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR_FAILED";
    logger.error("File processing failed for file", { fileId, error: message });
    return { success: false, error: message };
  }
}

/**
 * File processing pipeline for personal files (no project context).
 * Creates DocumentChunks with userId instead of projectId. Supports PDF, images, Excel, Word, CSV.
 */
export async function processPersonalFileOcr(params: {
  fileId: string;
  tenantId: string;
  userId: string;
  bucket: string;
  key: string;
  fileType: string;
  fileName: string;
}): Promise<{ success: true; chunkCount: number } | { success: false; error: string }> {
  const { fileId, tenantId, userId, bucket, key, fileType, fileName } = params;

  if (!isProcessableFile(fileType, fileName)) {
    return { success: true, chunkCount: 0 };
  }

  const detected = detectFileType(fileType, fileName);
  if (
    (detected === "pdf" || detected === "image") &&
    !process.env.MISTRAL_API_KEY
  ) {
    logger.warn("MISTRAL_API_KEY not set — skipping OCR for personal file", {
      fileId,
    });
    return { success: true, chunkCount: 0 };
  }

  try {
    const { text, source } = await processFileContent(
      bucket,
      key,
      fileType,
      fileName
    );

    if (!text.trim()) {
      logger.info("No text extracted for personal file", { fileId });
      return { success: true, chunkCount: 0 };
    }

    const db = tenantDb(tenantId);

    await db.file.update({
      where: { id: fileId },
      data: { ocrText: text },
    });

    const pages: OcrPage[] = [{ index: 0, markdown: text }];
    const textChunks = chunkText(pages);

    if (textChunks.length > 0) {
      await db.documentChunk.deleteMany({
        where: { fileId },
      });

      for (const chunk of textChunks) {
        await db.documentChunk.create({
          data: {
            content: chunk.content,
            page: chunk.page,
            metadata: { position: chunk.position, source },
            fileId,
            tenantId,
            userId,
          },
        });
      }

      if (process.env.OPENAI_API_KEY) {
        queueEmbeddingProcessing(fileId, tenantId);
      } else {
        logger.warn("OPENAI_API_KEY not set — skipping embedding queue for personal file", {
          fileId,
        });
      }
    }

    // Trigger background file analysis (label + AI description + embeddings)
    queueFileAnalysis({
      fileId,
      fileName,
      fileType,
      bucket,
      key,
      tenantId,
      projectId: undefined,
      userId,
      ocrText: text,
      userDescription: "",
    });

    logger.info("File processing completed for personal file", {
      fileId,
      chunkCount: textChunks.length,
      source,
    });
    return { success: true, chunkCount: textChunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR_FAILED";
    logger.error("File processing failed for personal file", {
      fileId,
      error: message,
    });
    return { success: false, error: message };
  }
}
