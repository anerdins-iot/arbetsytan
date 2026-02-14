"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { tenantDb, userDb } from "@/lib/db";
import {
  emitNoteCreatedToUser,
  emitNoteUpdatedToUser,
  emitNoteDeletedToUser,
} from "@/lib/socket";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  personalObjectKey,
  assertObjectExists,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_FILE_TYPES,
} from "@/lib/minio";

const hasAllowedExtension = (fileName: string): boolean =>
  /\.(pdf|jpe?g|png|webp|docx|xlsx)$/i.test(fileName);
function validateFileType(fileName: string, fileType: string): boolean {
  if (ALLOWED_FILE_TYPES.has(fileType)) return true;
  return hasAllowedExtension(fileName);
}
function validateSize(fileSize: number): void {
  if (fileSize > MAX_FILE_SIZE_BYTES) throw new Error("FILE_TOO_LARGE");
}
function validateType(fileName: string, fileType: string): void {
  if (!validateFileType(fileName, fileType)) throw new Error("FILE_TYPE_NOT_ALLOWED");
}

async function assertTenantStorageLimit(
  tenantId: string,
  incomingFileSize: number
): Promise<void> {
  const { MAX_TENANT_STORAGE_BYTES } = await import("@/lib/minio");
  const db = tenantDb(tenantId);
  const usage = await db.file.aggregate({ _sum: { size: true } });
  const currentSize = usage._sum.size ?? 0;
  if (currentSize + incomingFileSize > MAX_TENANT_STORAGE_BYTES) {
    throw new Error("TENANT_STORAGE_LIMIT_EXCEEDED");
  }
}

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type PersonalNoteItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonalFileItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
};

export type PersonalFileItemWithUrls = PersonalFileItem & {
  previewUrl: string;
  downloadUrl: string;
  ocrText: string | null;
};

// ─────────────────────────────────────────
// Get personal notes (no project)
// ─────────────────────────────────────────

export async function getPersonalNotes(options?: {
  limit?: number;
  category?: string;
  search?: string;
}): Promise<
  | { success: true; notes: PersonalNoteItem[] }
  | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const udb = userDb(userId);

    const where: Record<string, unknown> = {};
    if (options?.category) {
      where.category = options.category;
    }
    if (options?.search?.trim()) {
      where.AND = [
        {
          OR: [
            { title: { contains: options.search!.trim(), mode: "insensitive" as const } },
            { content: { contains: options.search!.trim(), mode: "insensitive" as const } },
          ],
        },
      ];
    }

    const notes = await udb.note.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: options?.limit ?? 50,
    });

    return {
      success: true,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        category: n.category,
        isPinned: n.isPinned,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
    };
  } catch {
    return { success: false, error: "Failed to fetch personal notes" };
  }
}

// ─────────────────────────────────────────
// Create / update / delete personal notes
// ─────────────────────────────────────────

const createNoteSchema = z.object({
  title: z.string().max(200).optional().default(""),
  content: z.string().min(1).max(10000),
  category: z.string().max(50).optional(),
});

export async function createPersonalNote(data: {
  title?: string;
  content: string;
  category?: string;
}): Promise<
  | { success: true; note: PersonalNoteItem }
  | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const parsed = createNoteSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const udb = userDb(userId);
    const note = await udb.note.create({
      data: {
        title: parsed.data.title ?? "",
        content: parsed.data.content,
        category: parsed.data.category ?? null,
        createdById: userId,
      },
    });

    emitNoteCreatedToUser(userId, {
      noteId: note.id,
      projectId: null,
      title: note.title,
      category: note.category,
      createdById: userId,
    });

    return {
      success: true,
      note: {
        id: note.id,
        title: note.title,
        content: note.content,
        category: note.category,
        isPinned: note.isPinned,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    };
  } catch {
    return { success: false, error: "Kunde inte skapa anteckning." };
  }
}

const updateNoteSchema = z.object({
  noteId: z.string().min(1),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  category: z.string().max(50).optional().nullable(),
});

export async function updatePersonalNote(
  noteId: string,
  data: { title?: string; content?: string; category?: string | null }
): Promise<
  | { success: true; note: PersonalNoteItem }
  | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const parsed = updateNoteSchema.safeParse({ noteId, ...data });
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const udb = userDb(userId);
    const note = await udb.note.update({
      where: { id: noteId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.category !== undefined && { category: data.category }),
      },
    });

    emitNoteUpdatedToUser(userId, {
      noteId: note.id,
      projectId: null,
      title: note.title,
      category: note.category,
      createdById: userId,
    });

    return {
      success: true,
      note: {
        id: note.id,
        title: note.title,
        content: note.content,
        category: note.category,
        isPinned: note.isPinned,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    };
  } catch {
    return { success: false, error: "Kunde inte uppdatera anteckning." };
  }
}

export async function deletePersonalNote(noteId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const udb = userDb(userId);
    await udb.note.delete({ where: { id: noteId } });
    emitNoteDeletedToUser(userId, {
      noteId,
      projectId: null,
      title: "",
      category: null,
      createdById: userId,
    });
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort anteckning." };
  }
}

export async function togglePersonalNotePin(noteId: string): Promise<
  { success: true; isPinned: boolean } | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const udb = userDb(userId);
    const existing = await udb.note.findFirst({ where: { id: noteId } });
    if (!existing) return { success: false, error: "Anteckningen hittades inte." };
    const updated = await udb.note.update({
      where: { id: noteId },
      data: { isPinned: !existing.isPinned },
    });
    emitNoteUpdatedToUser(userId, {
      noteId: updated.id,
      projectId: null,
      title: updated.title,
      category: updated.category,
      createdById: userId,
    });
    return { success: true, isPinned: updated.isPinned };
  } catch {
    return { success: false, error: "Kunde inte ändra fäststatus." };
  }
}

// ─────────────────────────────────────────
// Get personal files (no project)
// ─────────────────────────────────────────

export async function getPersonalFiles(options?: {
  limit?: number;
}): Promise<
  | { success: true; files: PersonalFileItem[] }
  | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const udb = userDb(userId);

    const files = await udb.file.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 100,
    });

    return {
      success: true,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  } catch {
    return { success: false, error: "Failed to fetch personal files" };
  }
}

// ─────────────────────────────────────────
// Get personal files with presigned URLs
// ─────────────────────────────────────────

export async function getPersonalFilesWithUrls(options?: {
  limit?: number;
}): Promise<
  | { success: true; files: PersonalFileItemWithUrls[] }
  | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const udb = userDb(userId);

    const files = await udb.file.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        bucket: true,
        key: true,
        ocrText: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 100,
    });

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
          createdAt: file.createdAt.toISOString(),
          previewUrl: downloadUrl,
          downloadUrl,
          ocrText: file.ocrText,
        };
      })
    );

    const filesWithUrls = results.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      const file = files[index];
      return {
        id: file!.id,
        name: file!.name,
        type: file!.type,
        size: file!.size,
        createdAt: file!.createdAt.toISOString(),
        previewUrl: "#",
        downloadUrl: "#",
        ocrText: file!.ocrText,
      };
    });

    return { success: true, files: filesWithUrls };
  } catch {
    return { success: false, error: "Failed to fetch personal files" };
  }
}

// ─────────────────────────────────────────
// Delete personal file
// ─────────────────────────────────────────

export async function deletePersonalFile(input: {
  fileId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId } = await requireAuth();
    const parsed = z.object({ fileId: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return { success: false, error: "VALIDATION_ERROR" };

    const udb = userDb(userId);
    const file = await udb.file.findFirst({
      where: { id: parsed.data.fileId },
      select: { id: true, bucket: true, key: true },
    });
    if (!file) return { success: false, error: "FILE_NOT_FOUND" };

    const { deleteObject } = await import("@/lib/minio");
    await deleteObject({ bucket: file.bucket, key: file.key });
    await udb.file.delete({ where: { id: file.id } });
    return { success: true };
  } catch {
    return { success: false, error: "DELETE_FILE_FAILED" };
  }
}

// ─────────────────────────────────────────
// Prepare / complete personal file upload
// ─────────────────────────────────────────

export async function preparePersonalFileUpload(input: {
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<
  | { success: true; uploadUrl: string; bucket: string; key: string; maxFileSize: number }
  | { success: false; error: string }
> {
  try {
    const { userId, tenantId } = await requireAuth();
    validateSize(input.fileSize);
    validateType(input.fileName, input.fileType);
    await assertTenantStorageLimit(tenantId, input.fileSize);

    const { ensureTenantBucket } = await import("@/lib/minio");
    const bucket = await ensureTenantBucket(tenantId);
    const key = personalObjectKey(userId, input.fileName, randomUUID());
    const uploadUrl = await createPresignedUploadUrl({
      bucket,
      key,
      contentType: input.fileType,
    });

    return {
      success: true,
      uploadUrl,
      bucket,
      key,
      maxFileSize: MAX_FILE_SIZE_BYTES,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_PREPARE_FAILED";
    return { success: false, error: message };
  }
}

const completePersonalUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  bucket: z.string().min(1),
  key: z.string().min(1),
});

export async function completePersonalFileUpload(input: {
  fileName: string;
  fileType: string;
  fileSize: number;
  bucket: string;
  key: string;
}): Promise<
  | { success: true; file: PersonalFileItem }
  | { success: false; error: string }
> {
  try {
    const { userId } = await requireAuth();
    const parsed = completePersonalUploadSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "VALIDATION_ERROR" };

    const { fileName, fileType, fileSize, bucket, key } = parsed.data;
    validateSize(fileSize);
    validateType(fileName, fileType);
    await assertObjectExists({ bucket, key });

    const udb = userDb(userId);
    const created = await udb.file.create({
      data: {
        name: fileName,
        type: fileType,
        size: fileSize,
        bucket,
        key,
        uploadedById: userId,
      },
    });

    return {
      success: true,
      file: {
        id: created.id,
        name: created.name,
        type: created.type,
        size: created.size,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_COMPLETE_FAILED";
    return { success: false, error: message };
  }
}
