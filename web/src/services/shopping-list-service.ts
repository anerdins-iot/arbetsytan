import { tenantDb } from "@/lib/db";
import type { ServiceContext } from "./types";

export interface ShoppingListListItem {
  id: string;
  title: string;
  projectId: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  checkedCount: number;
  createdBy: { id: string; name: string | null; email: string };
}

export interface ShoppingListItemType {
  id: string;
  listId: string;
  name: string;
  articleNo: string | null;
  brand: string | null;
  supplier: string | null;
  quantity: number;
  unit: string | null;
  price: number | null;
  imageUrl: string | null;
  productUrl: string | null;
  notes: string | null;
  isChecked: boolean;
  checkedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
}

export interface ShoppingListDetail {
  id: string;
  title: string;
  projectId: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string };
  items: ShoppingListItemType[];
}

export async function getShoppingListsCore(
  ctx: ServiceContext,
  options?: { projectId?: string; includeArchived?: boolean; personalOnly?: boolean }
): Promise<ShoppingListListItem[]> {
  const db = tenantDb(ctx.tenantId);
  const lists = await db.shoppingList.findMany({
    where: {
      ...(options?.projectId ? { projectId: options.projectId } : {}),
      ...(options?.personalOnly ? { projectId: null } : {}),
      ...(options?.includeArchived ? {} : { isArchived: false }),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Promise.all(
    lists.map(async (list) => {
      const checkedCount = await db.shoppingListItem.count({
        where: { listId: list.id, isChecked: true },
      });
      return {
        id: list.id,
        title: list.title,
        projectId: list.projectId,
        isArchived: list.isArchived,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        itemCount: list._count.items,
        checkedCount,
        createdBy: list.createdBy,
      };
    })
  );
}

export async function getShoppingListCore(
  ctx: ServiceContext,
  listId: string
): Promise<ShoppingListDetail | null> {
  const db = tenantDb(ctx.tenantId);
  const list = await db.shoppingList.findUnique({
    where: { id: listId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!list) return null;
  return {
    id: list.id,
    title: list.title,
    projectId: list.projectId,
    isArchived: list.isArchived,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    createdBy: list.createdBy,
    items: list.items,
  };
}
