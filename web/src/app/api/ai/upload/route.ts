/**
 * POST /api/ai/upload — Filuppladdning via AI-chatten.
 * Tar emot fil + conversationId + optional projectId.
 * Sparar till MinIO och DB, triggar async analys.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  ensureTenantBucket,
  projectObjectKey,
  putObjectToMinio,
} from "@/lib/minio";
import { analyzeFileAsync } from "@/lib/ai/analyze-file";
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

    // Spara i DB
    const db = tenantDb(tenantId);
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

    // Skicka systemmeddelande till konversationen
    if (conversationId) {
      const existingConv = await db.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (existingConv) {
        await db.message.create({
          data: {
            role: "USER",
            content: `[Fil uppladdad: ${fileName} (${formatFileSize(fileSize)}, ${fileType})]`,
            conversationId,
          },
        });
      }
    }

    // Trigga async analys i bakgrunden
    analyzeFileAsync({
      fileId: created.id,
      fileName,
      fileType,
      bucket,
      key,
      tenantId,
      projectId: projectId ?? undefined,
      conversationId: conversationId ?? undefined,
      userId,
    });

    return NextResponse.json({
      success: true,
      file: {
        id: created.id,
        name: created.name,
        type: created.type,
        size: created.size,
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
