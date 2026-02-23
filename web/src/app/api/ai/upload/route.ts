/**
 * POST /api/ai/upload — Filuppladdning via AI-chatten.
 * Tar emot fil + conversationId + optional projectId.
 * Sparar till MinIO och DB, triggar async analys.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession, requireProject } from "@/lib/auth";
import { tenantDb, userDb } from "@/lib/db";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  ensureTenantBucket,
  projectObjectKey,
  putObjectToMinio,
  createPresignedDownloadUrl,
} from "@/lib/minio";
import { processFileOcr, processPersonalFileOcr } from "@/lib/ai/ocr";
import { logger } from "@/lib/logger";

// Tillåtna filtyper för chatt-uppladdning
function isAllowedFileType(fileType: string, fileName: string): boolean {
  if (ALLOWED_FILE_TYPES.has(fileType)) return true;
  return /\.(pdf|jpe?g|png|webp|docx|xlsx)$/i.test(fileName);
}

// Generera objektnyckel för personliga filer (utan projektkontext)
function personalObjectKey(userId: string, fileName: string, objectId: string): string {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "file";
  return `personal/${userId}/${objectId}-${normalized}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, tenantId } = session;
    const userId = user.id;

    // Läs multipart-data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const conversationId = formData.get("conversationId") as string | null;
    const projectId = formData.get("projectId") as string | null;
    const chatMode = formData.get("chatMode") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name;
    const fileType = file.type || "application/octet-stream";
    const fileSize = file.size;

    // Validera filstorlek
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
    }

    // Validera filtyp
    if (!isAllowedFileType(fileType, fileName)) {
      return NextResponse.json({ error: "FILE_TYPE_NOT_ALLOWED" }, { status: 400 });
    }

    // Validera projektåtkomst om projektId anges
    if (projectId) {
      try {
        await requireProject(tenantId, projectId, userId);
      } catch {
        return NextResponse.json({ error: "PROJECT_ACCESS_DENIED" }, { status: 403 });
      }
    }

    // Spara till MinIO
    const bucket = await ensureTenantBucket(tenantId);
    const objectId = randomUUID();
    const key = projectId
      ? projectObjectKey(projectId, fileName, objectId)
      : personalObjectKey(userId, fileName, objectId);

    const bytes = new Uint8Array(await file.arrayBuffer());
    await putObjectToMinio({
      bucket,
      key,
      body: bytes,
      contentType: fileType,
    });

    // Spara i DB (skip auto-emit on create because we want to include OCR/URL later)
    const db = projectId
      ? tenantDb(tenantId, { actorUserId: userId, skipEmit: true })
      : userDb(userId, {});
    const created = await db.file.create({
      data: {
        name: fileName,
        type: fileType,
        size: fileSize,
        bucket,
        key,
        projectId: projectId ?? null,
        uploadedById: userId,
      },
    });

    logger.info("AI chat file uploaded", {
      fileId: created.id,
      fileName,
      fileType,
      fileSize,
      projectId,
      conversationId,
      userId,
    });

    // Skicka systemmeddelande till konversationen (skippa i chatMode — bilden skickas via AI vision istället)
    if (conversationId && !chatMode) {
      // Use the same db client to find conversation
      const existingConv = await db.conversation.findFirst({
        where: { id: conversationId },
        select: { id: true, projectId: true },
      });
      if (existingConv) {
        const messageDb =
          existingConv.projectId == null
            ? userDb(userId, {})
            : tenantDb(tenantId, { actorUserId: userId, projectId: existingConv.projectId });
        await messageDb.message.create({
          data: {
            role: "USER",
            content: `[Fil uppladdad: ${fileName} (${formatFileSize(fileSize)}, ${fileType})]`,
            conversationId,
          },
        });
      }
    }

    // Kör OCR synkront
    let ocrText: string | null = null;
    try {
      if (projectId) {
        const ocrResult = await processFileOcr({
          fileId: created.id,
          projectId,
          tenantId,
          bucket,
          key,
          fileType,
          fileName,
        });
        if (ocrResult.success && ocrResult.chunkCount > 0) {
          const updatedFile = await db.file.findFirst({
            where: { id: created.id },
            select: { ocrText: true },
          });
          ocrText = updatedFile?.ocrText ?? null;
        }
      } else {
        const ocrResult = await processPersonalFileOcr({
          fileId: created.id,
          tenantId,
          userId,
          bucket,
          key,
          fileType,
          fileName,
        });
        if (ocrResult.success && ocrResult.chunkCount > 0) {
          const updatedFile = await db.file.findFirst({
            where: { id: created.id },
            select: { ocrText: true },
          });
          ocrText = updatedFile?.ocrText ?? null;
        }
      }
    } catch (err) {
      logger.warn("OCR failed during upload", {
        fileId: created.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Generate presigned download URL for the file
    const downloadUrl = await createPresignedDownloadUrl({
      bucket,
      key,
      expiresInSeconds: 60 * 60, // 1 hour
    });

    // Auto-emit update event with full data
    if (projectId) {
      const dbEmit = tenantDb(tenantId, { actorUserId: userId, projectId });
      // We don't need to actually change data, just trigger the emit via update
      await dbEmit.file.update({
        where: { id: created.id },
        data: {
          // Including extra fields in data is fine if they are in the schema,
          // but Prisma might complain if we pass 'url' which isn't in schema.
          // Wait, the emit payload uses the 'record' (result of DB op).
          // If the schema doesn't have 'url', we can't save it there.
          // But our SOCKET_EVENTS.fileUpdated payload expects 'url'.
        },
      });
    } else {
      const dbEmit = userDb(userId, {});
      await dbEmit.file.update({
        where: { id: created.id },
        data: {},
      });
    }

    // Wait, if 'url' and 'ocrText' (latest) are not in the 'record' returned by prisma.update,
    // they won't be in the payload.
    // ocrText IS in the schema. url is NOT.


    return NextResponse.json({
      success: true,
      file: {
        id: created.id,
        name: created.name,
        type: created.type,
        size: created.size,
        url: downloadUrl,
        ocrText,
      },
    });
  } catch (err) {
    logger.error("AI upload route error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
