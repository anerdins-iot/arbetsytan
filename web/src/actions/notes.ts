"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type NoteItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
};

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const createNoteSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().max(200).optional().default(""),
  content: z.string().min(1).max(10000),
  category: z.string().max(50).optional(),
});

const updateNoteSchema = z.object({
  projectId: z.string().min(1),
  noteId: z.string().min(1),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  category: z.string().max(50).optional().nullable(),
});

const deleteNoteSchema = z.object({
  projectId: z.string().min(1),
  noteId: z.string().min(1),
});

const toggleNotePinSchema = z.object({
  projectId: z.string().min(1),
  noteId: z.string().min(1),
});

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const noteInclude = {
  createdBy: {
    select: { id: true, name: true, email: true },
  },
} as const;

function formatNote(note: {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string };
}): NoteItem {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    isPinned: note.isPinned,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    createdBy: note.createdBy,
  };
}

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function createNote(
  projectId: string,
  data: { title?: string; content: string; category?: string }
): Promise<{ success: true; note: NoteItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = createNoteSchema.safeParse({ projectId, ...data });
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const note = await db.note.create({
      data: {
        title: parsed.data.title ?? "",
        content: parsed.data.content,
        category: parsed.data.category ?? null,
        projectId,
        createdById: userId,
      },
      include: noteInclude,
    });

    revalidatePath(`/[locale]/projects/${projectId}`, "page");
    return { success: true, note: formatNote(note) };
  } catch {
    return { success: false, error: "Kunde inte skapa anteckning." };
  }
}

export async function getNotes(
  projectId: string,
  options?: { category?: string; limit?: number; search?: string }
): Promise<{ success: true; notes: NoteItem[] } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const where: Record<string, unknown> = { projectId };
    if (options?.category) {
      where.category = options.category;
    }
    if (options?.search) {
      // Use AND to combine search with other filters
      where.AND = [
        {
          OR: [
            { title: { contains: options.search, mode: "insensitive" } },
            { content: { contains: options.search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const notes = await db.note.findMany({
      where,
      include: noteInclude,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: options?.limit ?? 50,
    });

    return { success: true, notes: notes.map(formatNote) };
  } catch {
    return { success: false, error: "Kunde inte hämta anteckningar." };
  }
}

export async function getNote(
  projectId: string,
  noteId: string
): Promise<{ success: true; note: NoteItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const note = await db.note.findFirst({
      where: { id: noteId, projectId },
      include: noteInclude,
    });
    if (!note) {
      return { success: false, error: "Anteckningen hittades inte." };
    }

    return { success: true, note: formatNote(note) };
  } catch {
    return { success: false, error: "Kunde inte hämta anteckning." };
  }
}

export async function updateNote(
  projectId: string,
  noteId: string,
  data: { title?: string; content?: string; category?: string | null }
): Promise<{ success: true; note: NoteItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = updateNoteSchema.safeParse({ projectId, noteId, ...data });
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const existing = await db.note.findFirst({
      where: { id: noteId, projectId },
    });
    if (!existing) {
      return { success: false, error: "Anteckningen hittades inte." };
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;

    const note = await db.note.update({
      where: { id: noteId },
      data: updateData,
      include: noteInclude,
    });

    revalidatePath(`/[locale]/projects/${projectId}`, "page");
    return { success: true, note: formatNote(note) };
  } catch {
    return { success: false, error: "Kunde inte uppdatera anteckning." };
  }
}

export async function deleteNote(
  projectId: string,
  noteId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = deleteNoteSchema.safeParse({ projectId, noteId });
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const existing = await db.note.findFirst({
      where: { id: noteId, projectId },
    });
    if (!existing) {
      return { success: false, error: "Anteckningen hittades inte." };
    }

    await db.note.delete({ where: { id: noteId } });

    revalidatePath(`/[locale]/projects/${projectId}`, "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort anteckning." };
  }
}

export async function toggleNotePin(
  projectId: string,
  noteId: string
): Promise<{ success: true; isPinned: boolean } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = toggleNotePinSchema.safeParse({ projectId, noteId });
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    await requireProject(tenantId, projectId, userId);
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const existing = await db.note.findFirst({
      where: { id: noteId, projectId },
    });
    if (!existing) {
      return { success: false, error: "Anteckningen hittades inte." };
    }

    const updated = await db.note.update({
      where: { id: noteId },
      data: { isPinned: !existing.isPinned },
    });

    revalidatePath(`/[locale]/projects/${projectId}`, "page");
    return { success: true, isPinned: updated.isPinned };
  } catch {
    return { success: false, error: "Kunde inte ändra fäststatus." };
  }
}
