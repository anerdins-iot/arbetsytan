import { tenantDb, userDb } from "@/lib/db";
import type { ServiceContext } from "./types";

export type NoteAttachmentItem = {
  id: string;
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: Date;
};

/**
 * Get attachments for a project note.
 */
export async function getProjectNoteAttachmentsCore(
  ctx: ServiceContext,
  projectId: string,
  noteId: string
): Promise<NoteAttachmentItem[]> {
  const db = tenantDb(ctx.tenantId);

  const attachments = await db.noteAttachment.findMany({
    where: { noteId, note: { projectId } },
    include: {
      file: { select: { id: true, name: true, type: true, size: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return attachments.map((a: any) => ({
    id: a.id,
    fileId: a.file.id,
    fileName: a.file.name,
    fileType: a.file.type,
    fileSize: a.file.size,
    createdAt: a.createdAt,
  }));
}

/**
 * Get attachments for a personal note.
 */
export async function getPersonalNoteAttachmentsCore(
  ctx: ServiceContext,
  noteId: string
): Promise<NoteAttachmentItem[]> {
  const udb = userDb(ctx.userId, {});

  // First verify the note belongs to user
  const note = await udb.note.findFirst({
    where: { id: noteId },
    select: { id: true },
  });
  if (!note) return [];

  // NoteAttachment doesn't have userDb scoping, use global prisma
  // but we already verified note ownership above
  const { prisma } = await import("@/lib/db");
  const attachments = await prisma.noteAttachment.findMany({
    where: { noteId },
    include: {
      file: { select: { id: true, name: true, type: true, size: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return attachments.map((a) => ({
    id: a.id,
    fileId: a.file.id,
    fileName: a.file.name,
    fileType: a.file.type,
    fileSize: a.file.size,
    createdAt: a.createdAt,
  }));
}
