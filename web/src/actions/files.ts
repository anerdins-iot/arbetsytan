"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_TENANT_STORAGE_BYTES,
  assertObjectExists,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  ensureTenantBucket,
  projectObjectKey,
  putObjectToMinio,
} from "@/lib/minio";
import { processFileOcr } from "@/lib/ai/ocr";
import { logger } from "@/lib/logger";
import { getProjectFilesCore } from "@/services/file-service";

const uploadPreparationSchema = z.object({
  projectId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
});

const completeUploadSchema = z.object({
  projectId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  bucket: z.string().min(1),
  key: z.string().min(1),
});

const uploadFileFormSchema = z.object({
  projectId: z.string().min(1),
  file: z.instanceof(File),
});

const projectIdSchema = z.string().min(1);
const deleteFileSchema = z.object({
  projectId: z.string().min(1),
  fileId: z.string().min(1),
});

export type FileItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  bucket: string;
  key: string;
  ocrText: string | null;
  userDescription: string | null;
  aiAnalysis: string | null;
  label: string | null;
  createdAt: Date;
  previewUrl: string;
  downloadUrl: string;
};

function hasAllowedExtension(fileName: string): boolean {
  return /\.(pdf|jpe?g|png|webp|docx|xlsx)$/i.test(fileName);
}

function validateFileType(fileName: string, fileType: string): boolean {
  if (ALLOWED_FILE_TYPES.has(fileType)) {
    return true;
  }
  return hasAllowedExtension(fileName);
}

async function assertTenantStorageLimit(
  tenantId: string,
  incomingFileSize: number
): Promise<void> {
  const db = tenantDb(tenantId);
  const usage = await db.file.aggregate({
    _sum: { size: true },
  });
  const currentSize = usage._sum.size ?? 0;
  if (currentSize + incomingFileSize > MAX_TENANT_STORAGE_BYTES) {
    throw new Error("TENANT_STORAGE_LIMIT_EXCEEDED");
  }
}

function validateSize(fileSize: number): void {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
}

function validateType(fileName: string, fileType: string): void {
  if (!validateFileType(fileName, fileType)) {
    throw new Error("FILE_TYPE_NOT_ALLOWED");
  }
}

export async function prepareFileUpload(input: {
  projectId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<
  | {
      success: true;
      uploadUrl: string;
      bucket: string;
      key: string;
      maxFileSize: number;
    }
  | { success: false; error: string }
> {
  const { tenantId, userId } = await requirePermission("canUploadFiles");
  const parsed = uploadPreparationSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("prepareFileUpload validation failed", {
      errors: parsed.error.flatten(),
      input: {
        projectId: input.projectId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
      },
    });
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { projectId, fileName, fileType, fileSize } = parsed.data;

  try {
    await requireProject(tenantId, projectId, userId);
    validateSize(fileSize);
    validateType(fileName, fileType);
    await assertTenantStorageLimit(tenantId, fileSize);

    const bucket = await ensureTenantBucket(tenantId);
    const key = projectObjectKey(projectId, fileName, randomUUID());
    const uploadUrl = await createPresignedUploadUrl({
      bucket,
      key,
      contentType: fileType,
    });

    return {
      success: true,
      uploadUrl,
      bucket,
      key,
      maxFileSize: MAX_FILE_SIZE_BYTES,
    };
  } catch (error) {
    logger.error("prepareFileUpload failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      projectId,
      fileName,
    });
    const message = error instanceof Error ? error.message : "UPLOAD_PREPARE_FAILED";
    return { success: false, error: message };
  }
}

export async function completeFileUpload(input: {
  projectId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  bucket: string;
  key: string;
}): Promise<
  | {
      success: true;
      file: FileItem;
    }
  | { success: false; error: string }
> {
  const { tenantId, userId } = await requirePermission("canUploadFiles");
  const parsed = completeUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { projectId, fileName, fileType, fileSize, bucket, key } = parsed.data;

  try {
    await requireProject(tenantId, projectId, userId);
    validateSize(fileSize);
    validateType(fileName, fileType);
    await assertTenantStorageLimit(tenantId, fileSize);
    await assertObjectExists({ bucket, key });

    const db = tenantDb(tenantId, { actorUserId: userId, projectId });
    const created = await db.file.create({
      data: {
        name: fileName,
        type: fileType,
        size: fileSize,
        bucket,
        key,
        projectId,
        uploadedById: userId,
      },
    });

    await logActivity(tenantId, projectId, userId, "uploaded", "file", created.id, {
      fileName: created.name,
      fileSize: created.size,
      fileType: created.type,
    });

    // Trigger OCR in background (fire-and-forget)
    processFileOcr({
      fileId: created.id,
      projectId,
      tenantId,
      bucket: created.bucket,
      key: created.key,
      fileType: created.type,
      fileName: created.name,
    }).catch((err) => {
      logger.error("Background OCR failed for file", { fileId: created.id, error: err instanceof Error ? err.message : String(err) });
    });

    const previewUrl = await createPresignedDownloadUrl({
      bucket: created.bucket,
      key: created.key,
    });

    revalidatePath("/[locale]/projects/[projectId]", "page");

    return {
      success: true,
      file: {
        id: created.id,
        name: created.name,
        type: created.type,
        size: created.size,
        bucket: created.bucket,
        key: created.key,
        ocrText: null,
        userDescription: null,
        aiAnalysis: null,
        label: null,
        createdAt: created.createdAt,
        previewUrl,
        downloadUrl: previewUrl,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_COMPLETE_FAILED";
    return { success: false, error: message };
  }
}

export async function uploadFile(
  formData: FormData
): Promise<{ success: true; file: FileItem } | { success: false; error: string }> {
  const { tenantId, userId } = await requirePermission("canUploadFiles");
  const parsed = uploadFileFormSchema.safeParse({
    projectId: formData.get("projectId"),
    file: formData.get("file"),
  });

  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { projectId, file } = parsed.data;
  const fileName = file.name;
  const fileType = file.type || "application/octet-stream";
  const fileSize = file.size;

  try {
    await requireProject(tenantId, projectId, userId);
    validateSize(fileSize);
    validateType(fileName, fileType);
    await assertTenantStorageLimit(tenantId, fileSize);

    const bucket = await ensureTenantBucket(tenantId);
    const key = projectObjectKey(projectId, fileName, randomUUID());
    const bytes = new Uint8Array(await file.arrayBuffer());
    await putObjectToMinio({
      bucket,
      key,
      body: bytes,
      contentType: fileType,
    });

    const db = tenantDb(tenantId, { actorUserId: userId, projectId });
    const created = await db.file.create({
      data: {
        name: fileName,
        type: fileType,
        size: fileSize,
        bucket,
        key,
        projectId,
        uploadedById: userId,
      },
    });

    await logActivity(tenantId, projectId, userId, "uploaded", "file", created.id, {
      fileName: created.name,
      fileSize: created.size,
      fileType: created.type,
    });

    // Trigger OCR in background (fire-and-forget)
    processFileOcr({
      fileId: created.id,
      projectId,
      tenantId,
      bucket: created.bucket,
      key: created.key,
      fileType: created.type,
      fileName: created.name,
    }).catch((err) => {
      logger.error("Background OCR failed for file", { fileId: created.id, error: err instanceof Error ? err.message : String(err) });
    });

    const previewUrl = await createPresignedDownloadUrl({
      bucket: created.bucket,
      key: created.key,
    });

    revalidatePath("/[locale]/projects/[projectId]", "page");

    return {
      success: true,
        file: {
        id: created.id,
        name: created.name,
        type: created.type,
        size: created.size,
        bucket: created.bucket,
        key: created.key,
        ocrText: null,
        userDescription: null,
        aiAnalysis: null,
        label: null,
        createdAt: created.createdAt,
        previewUrl,
        downloadUrl: previewUrl,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
    return { success: false, error: message };
  }
}

export async function getProjectFiles(
  projectId: string
): Promise<{ success: true; files: FileItem[] } | { success: false; error: string }> {
  logger.info("getProjectFiles called", { projectId });

  // Validera att det inte är ett filnamn (AI kan ibland skicka bildnamn som projectId)
  if (/\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|txt|csv)$/i.test(projectId)) {
    logger.warn("getProjectFiles rejected filename as projectId", { projectId });
    return { success: false, error: `"${projectId}" är ett filnamn, inte ett projekt-ID.` };
  }

  const { tenantId, userId } = await requireAuth();
  logger.info("getProjectFiles auth", { tenantId, userId });
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) {
    logger.warn("getProjectFiles validation failed", { projectId, errors: parsed.error.flatten() });
    return { success: false, error: "VALIDATION_ERROR" };
  }
  const validatedProjectId = parsed.data;

  try {
    await requireProject(tenantId, validatedProjectId, userId);

    const files = await getProjectFilesCore(
      { tenantId, userId },
      validatedProjectId,
      { includeAnalyses: false }
    );
    logger.info("getProjectFiles db query result", { projectId: validatedProjectId, fileCount: files.length });

    // Promise.allSettled så att en felande presigned URL inte fäller hela listan (t.ex. för AI-genererade filer)
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const downloadUrl = await createPresignedDownloadUrl({
          bucket: file.bucket,
          key: file.objectKey,
        });
        return {
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          bucket: file.bucket,
          key: file.objectKey,
          ocrText: file.ocrText,
          userDescription: file.userDescription,
          aiAnalysis: file.aiAnalysis,
          label: file.label,
          createdAt: file.createdAt,
          previewUrl: downloadUrl,
          downloadUrl,
        };
      })
    );

    const filesWithUrls = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const file = files[index];
      logger.warn(
        "getProjectFiles: presigned URL misslyckades för fil, visar fil med fallback-URL",
        { fileId: file?.id, bucket: file?.bucket, key: file?.objectKey, err: result.reason }
      );
      return {
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        bucket: file.bucket,
        key: file.objectKey,
        ocrText: file.ocrText,
        userDescription: file.userDescription,
        aiAnalysis: file.aiAnalysis,
        label: file.label,
        createdAt: file.createdAt,
        previewUrl: "#",
        downloadUrl: "#",
      };
    });

    logger.info("getProjectFiles success", { projectId: validatedProjectId, returnedCount: filesWithUrls.length });
    return { success: true, files: filesWithUrls };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FETCH_FILES_FAILED";
    logger.error("getProjectFiles failed", { projectId, error: message, stack: error instanceof Error ? error.stack : undefined });
    return { success: false, error: message };
  }
}

export async function getFiles(
  projectId: string
): Promise<{ success: true; files: FileItem[] } | { success: false; error: string }> {
  return getProjectFiles(projectId);
}

export async function deleteFile(input: {
  projectId: string;
  fileId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { tenantId, userId, role } = await requireAuth();
  const parsed = deleteFileSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("deleteFile validation failed", { input, errors: parsed.error.flatten() });
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { projectId, fileId } = parsed.data;

  try {
    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    // Fetch file with uploadedById to check ownership
    const file = await db.file.findFirst({
      where: {
        id: fileId,
        projectId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        bucket: true,
        key: true,
        uploadedById: true,
      },
    });

    if (!file) {
      logger.warn("deleteFile: file not found", { projectId, fileId, userId });
      return { success: false, error: "FILE_NOT_FOUND" };
    }

    // Permission check:
    // 1. File owner can always delete their own files
    // 2. ADMIN can delete any file
    // 3. PROJECT_MANAGER can delete any file in projects they manage
    const isOwner = file.uploadedById === userId;
    const isAdmin = role === "ADMIN";
    const isProjectManager = role === "PROJECT_MANAGER";

    if (!isOwner && !isAdmin && !isProjectManager) {
      logger.warn("deleteFile: permission denied", {
        projectId,
        fileId,
        userId,
        fileOwnerId: file.uploadedById,
        userRole: role,
      });
      return { success: false, error: "DELETE_NOT_ALLOWED" };
    }

    await deleteObject({
      bucket: file.bucket,
      key: file.key,
    });

    await db.file.delete({
      where: {
        id: file.id,
      },
    });

    await logActivity(tenantId, projectId, userId, "deleted", "file", file.id, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    revalidatePath("/[locale]/projects/[projectId]", "page");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FILE_FAILED";
    logger.error("deleteFile failed", { projectId, fileId, error: message });
    return { success: false, error: message };
  }
}

const fileByIdSchema = z.object({
  projectId: z.string().min(1).optional(),
  fileId: z.string().min(1),
});

export type FilePreviewData = {
  id: string;
  name: string;
  type: string;
  size: number;
  ocrText: string | null;
  downloadUrl: string;
};

export async function getFilePreviewData(input: {
  fileId: string;
  projectId?: string;
}): Promise<
  | { success: true; file: FilePreviewData }
  | { success: false; error: string }
> {
  const { tenantId, userId } = await requireAuth();
  const parsed = fileByIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { fileId, projectId } = parsed.data;

  try {
    if (projectId) {
      await requireProject(tenantId, projectId, userId);
    }

    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const whereClause: Record<string, unknown> = { id: fileId };
    if (projectId) {
      whereClause.projectId = projectId;
    } else {
      // Personal file — owned by user
      whereClause.projectId = null;
      whereClause.uploadedById = userId;
    }

    const file = await db.file.findFirst({
      where: whereClause,
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        bucket: true,
        key: true,
        ocrText: true,
      },
    });

    if (!file) {
      return { success: false, error: "FILE_NOT_FOUND" };
    }

    const downloadUrl = await createPresignedDownloadUrl({
      bucket: file.bucket,
      key: file.key,
    });

    return {
      success: true,
      file: {
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        ocrText: file.ocrText,
        downloadUrl,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FETCH_FILE_FAILED";
    return { success: false, error: message };
  }
}

const getFileOcrSchema = z.object({
  projectId: z.string().min(1),
  fileId: z.string().min(1),
});

export async function getFileOcrText(input: {
  projectId: string;
  fileId: string;
}): Promise<
  | { success: true; ocrText: string | null; chunkCount: number }
  | { success: false; error: string }
> {
  const { tenantId, userId } = await requireAuth();
  const parsed = getFileOcrSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { projectId, fileId } = parsed.data;

  try {
    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const file = await db.file.findFirst({
      where: { id: fileId, projectId },
      select: { ocrText: true },
    });

    if (!file) {
      return { success: false, error: "FILE_NOT_FOUND" };
    }

    const chunkCount = await db.documentChunk.count({
      where: { fileId },
    });

    return { success: true, ocrText: file.ocrText, chunkCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FETCH_OCR_FAILED";
    return { success: false, error: message };
  }
}
