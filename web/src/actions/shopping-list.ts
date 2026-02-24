"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import {
  getShoppingListCore,
  getShoppingListsCore,
  type ShoppingListDetail,
  type ShoppingListListItem,
} from "@/services/shopping-list-service";

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const createListSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().optional(),
});

const updateListSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
});

const addItemSchema = z.object({
  name: z.string().min(1).max(500),
  articleNo: z.string().max(100).optional(),
  brand: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  quantity: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
  price: z.number().min(0).optional(),
  imageUrl: z.string().url().max(2000).optional(),
  productUrl: z.string().url().max(2000).optional(),
  notes: z.string().max(1000).optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  quantity: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  price: z.number().min(0).optional(),
});

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function createShoppingList(
  data: { title: string; projectId?: string }
): Promise<{ success: true; listId: string } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = createListSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const list = await db.shoppingList.create({
      data: {
        title: parsed.data.title,
        projectId: parsed.data.projectId ?? null,
        tenantId,
        createdById: userId,
      },
    });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true, listId: list.id };
  } catch {
    return { success: false, error: "Kunde inte skapa inköpslista." };
  }
}

export async function updateShoppingList(
  listId: string,
  data: { title?: string; isArchived?: boolean }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = updateListSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.shoppingList.findUnique({ where: { id: listId } });
    if (!existing) return { success: false, error: "Listan hittades inte." };

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.isArchived !== undefined) updateData.isArchived = parsed.data.isArchived;

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "Ange minst ett fält att uppdatera." };
    }

    await db.shoppingList.update({ where: { id: listId }, data: updateData });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte uppdatera inköpslista." };
  }
}

export async function deleteShoppingList(
  listId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.shoppingList.findUnique({ where: { id: listId } });
    if (!existing) return { success: false, error: "Listan hittades inte." };

    await db.shoppingList.delete({ where: { id: listId } });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort inköpslista." };
  }
}

export async function addShoppingListItem(
  listId: string,
  item: {
    name: string;
    articleNo?: string;
    brand?: string;
    supplier?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    imageUrl?: string;
    productUrl?: string;
    notes?: string;
  }
): Promise<{ success: true; itemId: string } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = addItemSchema.safeParse(item);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const list = await db.shoppingList.findUnique({ where: { id: listId } });
    if (!list) return { success: false, error: "Listan hittades inte." };

    // Get max sortOrder
    const maxSort = await db.shoppingListItem.findFirst({
      where: { listId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await db.shoppingListItem.create({
      data: {
        listId,
        name: parsed.data.name,
        articleNo: parsed.data.articleNo ?? null,
        brand: parsed.data.brand ?? null,
        supplier: parsed.data.supplier ?? null,
        quantity: parsed.data.quantity ?? 1,
        unit: parsed.data.unit ?? null,
        price: parsed.data.price ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        productUrl: parsed.data.productUrl ?? null,
        notes: parsed.data.notes ?? null,
        sortOrder: (maxSort?.sortOrder ?? 0) + 1,
      },
    });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true, itemId: created.id };
  } catch {
    return { success: false, error: "Kunde inte lägga till artikel." };
  }
}

export async function updateShoppingListItem(
  itemId: string,
  updates: { name?: string; quantity?: number; notes?: string; price?: number }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = updateItemSchema.safeParse(updates);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.shoppingListItem.findUnique({ where: { id: itemId } });
    if (!existing) return { success: false, error: "Artikeln hittades inte." };

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.quantity !== undefined) updateData.quantity = parsed.data.quantity;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.price !== undefined) updateData.price = parsed.data.price;

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "Ange minst ett fält att uppdatera." };
    }

    await db.shoppingListItem.update({ where: { id: itemId }, data: updateData });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte uppdatera artikel." };
  }
}

export async function toggleShoppingListItem(
  itemId: string
): Promise<{ success: true; isChecked: boolean } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.shoppingListItem.findUnique({ where: { id: itemId } });
    if (!existing) return { success: false, error: "Artikeln hittades inte." };

    const newChecked = !existing.isChecked;
    await db.shoppingListItem.update({
      where: { id: itemId },
      data: {
        isChecked: newChecked,
        checkedAt: newChecked ? new Date() : null,
      },
    });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true, isChecked: newChecked };
  } catch {
    return { success: false, error: "Kunde inte ändra status." };
  }
}

export async function deleteShoppingListItem(
  itemId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.shoppingListItem.findUnique({ where: { id: itemId } });
    if (!existing) return { success: false, error: "Artikeln hittades inte." };

    await db.shoppingListItem.delete({ where: { id: itemId } });

    revalidatePath("/[locale]/shopping-lists", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort artikel." };
  }
}

export async function getShoppingList(
  listId: string
): Promise<{ success: true; list: ShoppingListDetail } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const list = await getShoppingListCore({ tenantId, userId }, listId);
    if (!list) return { success: false, error: "Listan hittades inte." };
    return { success: true, list };
  } catch {
    return { success: false, error: "Kunde inte hämta inköpslista." };
  }
}

export type SerializedShoppingListItem = Omit<ShoppingListListItem, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export async function getShoppingLists(
  options?: { projectId?: string; includeArchived?: boolean }
): Promise<{ success: true; lists: SerializedShoppingListItem[] } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const lists = await getShoppingListsCore({ tenantId, userId }, options);
    return {
      success: true,
      lists: lists.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
    };
  } catch {
    return { success: false, error: "Kunde inte hämta inköpslistor." };
  }
}
