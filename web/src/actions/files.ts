"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { emitFileCreatedToProject, emitFileDeletedToProject } from "@/lib/socket";
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
import { sendProjectToPersonalAIMessage } from "@/lib/ai/aimessage-triggers";
import { logger } from "@/lib/logger";

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

const projectIdSchema = z.string().uuid();
const deleteFileSchema = z.object({
  projectId: z.string().uuid(),
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

    const db = tenantDb(tenantId);
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

    emitFileCreatedToProject(projectId, {
      projectId,
      fileId: created.id,
      actorUserId: userId,
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

    const db = tenantDb(tenantId);
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

    emitFileCreatedToProject(projectId, {
      projectId,
      fileId: created.id,
      actorUserId: userId,
    });

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    const projectMembers = await db.projectMember.findMany({
      where: { projectId },
      include: { membership: { select: { userId: true } } },
    });
    const content = `En ny fil har laddats upp i projektet ${project?.name ?? "projektet"}: ${created.name}.`;
    for (const pm of projectMembers) {
      await sendProjectToPersonalAIMessage({
        db,
        projectId,
        userId: pm.membership.userId,
        type: "file_uploaded",
        content,
      });
    }

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
  const { tenantId, userId } = await requireAuth();
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }
  const validatedProjectId = parsed.data;

  try {
    await requireProject(tenantId, validatedProjectId, userId);
    const db = tenantDb(tenantId);

    // Alla filer för projektet (både uppladdade och AI-genererade) – ingen filtrering på source
    const files = await db.file.findMany({
      where: { projectId: validatedProjectId },
      orderBy: { createdAt: "desc" },
    });

    // Promise.allSettled så att en felande presigned URL inte fäller hela listan (t.ex. för AI-genererade filer)
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const downloadUrl = await createPresignedDownloadUrl({
          bucket: file.bucket,
          key: file.key,
        });
        return {
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          bucket: file.bucket,
          key: file.key,
          ocrText: file.ocrText,
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
        { fileId: file?.id, bucket: file?.bucket, key: file?.key, err: result.reason }
      );
      return {
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        bucket: file.bucket,
        key: file.key,
        ocrText: file.ocrText,
        createdAt: file.createdAt,
        previewUrl: "#",
        downloadUrl: "#",
      };
    });

    return { success: true, files: filesWithUrls };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FETCH_FILES_FAILED";
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
  const { tenantId, userId } = await requirePermission("canDeleteFiles");
  const parsed = deleteFileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { projectId, fileId } = parsed.data;

  try {
    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId);
    const file = await db.file.findFirst({
      where: {
        id: fileId,
        projectId,
      },
    });

    if (!file) {
      return { success: false, error: "FILE_NOT_FOUND" };
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

    emitFileDeletedToProject(projectId, {
      projectId,
      fileId: file.id,
      actorUserId: userId,
    });

    revalidatePath("/[locale]/projects/[projectId]", "page");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FILE_FAILED";
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
    const db = tenantDb(tenantId);

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
