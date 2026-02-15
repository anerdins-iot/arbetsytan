/**
 * Saves an AI-generated document to MinIO and creates a File record in the project.
 * Caller must have validated project access (requireProject). Uses tenantDb for the File record.
 * The file appears in the project file list; activity is logged and socket event emitted.
 */
import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity-log";
import {
  ensureTenantBucket,
  projectObjectKey,
  putObjectToMinio,
} from "@/lib/minio";
import type { TenantScopedClient } from "@/lib/db";
import { queueFileAnalysis } from "@/lib/ai/queue-file-analysis";

export async function saveGeneratedDocumentToProject(params: {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  contentType: string;
  buffer: Uint8Array;
  content?: string;
}): Promise<{ fileId: string; name: string; bucket: string; key: string; size: number } | { error: string }> {
  const { db, tenantId, projectId, userId, fileName, contentType, buffer, content } = params;

  try {
    const bucket = await ensureTenantBucket(tenantId);
    const key = projectObjectKey(projectId, fileName, randomUUID());
    await putObjectToMinio({
      bucket,
      key,
      body: buffer,
      contentType,
    });

    // Bestäm filtyp för beskrivning
    const fileTypeDisplay = contentType.includes("pdf")
      ? "PDF"
      : contentType.includes("word") || contentType.includes("document")
      ? "Word-dokument"
      : contentType.includes("spreadsheet") || contentType.includes("excel")
      ? "Excel-fil"
      : "dokument";

    // Skapa AI-analys och användarens beskrivning
    const userDescription = `Automatiskt genererad ${fileTypeDisplay}`;
    const aiAnalysis = content
      ? `Automatiskt genererad ${fileTypeDisplay} - ${fileName}`
      : `Automatiskt genererad ${fileTypeDisplay}`;

    const file = await db.file.create({
      data: {
        name: fileName,
        type: contentType,
        size: buffer.length,
        bucket,
        key,
        projectId,
        uploadedById: userId,
        ocrText: content ?? null,
        userDescription,
        aiAnalysis,
      },
    });

    await logActivity(tenantId, projectId, userId, "uploaded", "file", file.id, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      source: "ai_generated",
    });

    // Köa filanalys i bakgrunden för att generera bättre label/description och embeddings
    queueFileAnalysis({
      fileId: file.id,
      fileName: file.name,
      fileType: file.type,
      bucket,
      key,
      tenantId,
      projectId,
      userId,
      ocrText: content ?? "",
      userDescription,
    });

    return { fileId: file.id, name: file.name, bucket, key, size: buffer.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_DOCUMENT_FAILED";
    return { error: message };
  }
}
