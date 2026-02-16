import { tenantDb, userDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type NoteListItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
};

export type GetNotesOptions = {
  category?: string;
  search?: string;
};

/**
 * Kärnlogik för projektanteckningar.
 */
export async function getProjectNotesCore(
  ctx: ServiceContext,
  projectId: string,
  options?: GetNotesOptions & PaginationOptions
): Promise<NoteListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const where: Record<string, any> = { projectId };
  if (options?.category) {
    where.category = options.category;
  }
  if (options?.search?.trim()) {
    where.AND = [
      {
        OR: [
          { title: { contains: options.search.trim(), mode: "insensitive" } },
          { content: { contains: options.search.trim(), mode: "insensitive" } },
        ],
      },
    ];
  }

  const notes = await db.note.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
    skip: options?.offset,
  });

  return notes.map((n: any) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    isPinned: n.isPinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy,
  }));
}

/**
 * Kärnlogik för personliga anteckningar.
 * Använder userDb(userId) istället för tenantDb.
 */
export async function getPersonalNotesCore(
  ctx: ServiceContext,
  options?: GetNotesOptions & PaginationOptions
): Promise<NoteListItem[]> {
  const udb = userDb(ctx.userId, {});

  const where: Record<string, any> = {};
  if (options?.category) {
    where.category = options.category;
  }
  if (options?.search?.trim()) {
    where.AND = [
      {
        OR: [
          { title: { contains: options.search.trim(), mode: "insensitive" } },
          { content: { contains: options.search.trim(), mode: "insensitive" } },
        ],
      },
    ];
  }

  const notes = await udb.note.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
    skip: options?.offset,
  });

  return notes.map((n: any) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    isPinned: n.isPinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy,
  }));
}
