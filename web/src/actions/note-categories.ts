"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type NoteCategoryItem = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  slug: z.string().max(100).optional(),
  color: z.string().max(20).optional().nullable(),
});

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function formatCategory(cat: {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NoteCategoryItem {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    color: cat.color,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString(),
  };
}

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function getNoteCategories(): Promise<
  { success: true; categories: NoteCategoryItem[] } | { success: false; error: string }
> {
  try {
    const { tenantId } = await requireAuth();
    const db = tenantDb(tenantId);

    const categories = await db.noteCategory.findMany({
      orderBy: { name: "asc" },
    });

    return { success: true, categories: categories.map(formatCategory) };
  } catch {
    return { success: false, error: "Kunde inte hämta kategorier." };
  }
}

export async function createNoteCategory(
  data: { name: string; slug?: string; color?: string }
): Promise<{ success: true; category: NoteCategoryItem } | { success: false; error: string }> {
  try {
    const { tenantId, userId } = await requireAuth();
    const parsed = createSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    const db = tenantDb(tenantId, { actorUserId: userId });
    const slug = parsed.data.slug || generateSlug(parsed.data.name);

    // Check for duplicate slug
    const existing = await db.noteCategory.findFirst({
      where: { slug },
    });
    if (existing) {
      return { success: false, error: "En kategori med detta slug finns redan." };
    }

    const category = await db.noteCategory.create({
      data: {
        name: parsed.data.name,
        slug,
        color: parsed.data.color ?? null,
        tenantId,
      },
    });

    return { success: true, category: formatCategory(category) };
  } catch {
    return { success: false, error: "Kunde inte skapa kategori." };
  }
}

export async function updateNoteCategory(
  id: string,
  data: { name?: string; slug?: string; color?: string | null }
): Promise<{ success: true; category: NoteCategoryItem } | { success: false; error: string }> {
  try {
    const { tenantId, userId } = await requireAuth();
    const parsed = updateSchema.safeParse({ id, ...data });
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.noteCategory.findFirst({
      where: { id },
    });
    if (!existing) {
      return { success: false, error: "Kategorin hittades inte." };
    }

    // If slug is changing, check for duplicates
    const newSlug = parsed.data.slug ?? (parsed.data.name ? generateSlug(parsed.data.name) : undefined);
    if (newSlug && newSlug !== existing.slug) {
      const duplicate = await db.noteCategory.findFirst({
        where: { slug: newSlug },
      });
      if (duplicate) {
        return { success: false, error: "En kategori med detta slug finns redan." };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (newSlug !== undefined) updateData.slug = newSlug;
    if (parsed.data.color !== undefined) updateData.color = parsed.data.color;

    const category = await db.noteCategory.update({
      where: { id },
      data: updateData,
    });

    return { success: true, category: formatCategory(category) };
  } catch {
    return { success: false, error: "Kunde inte uppdatera kategori." };
  }
}

export async function deleteNoteCategory(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { tenantId, userId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.noteCategory.findFirst({
      where: { id },
    });
    if (!existing) {
      return { success: false, error: "Kategorin hittades inte." };
    }

    // Check if any notes use this category
    const notesUsingCategory = await db.note.findFirst({
      where: { category: existing.slug },
    });
    if (notesUsingCategory) {
      return {
        success: false,
        error: "Kategorin kan inte tas bort eftersom den används av anteckningar. Ändra kategori på berörda anteckningar först.",
      };
    }

    await db.noteCategory.delete({ where: { id } });

    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort kategori." };
  }
}
