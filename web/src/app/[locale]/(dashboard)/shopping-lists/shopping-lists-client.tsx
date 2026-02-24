"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ShoppingListCard } from "@/components/shopping-list/shopping-list-card";
import { createShoppingList } from "@/actions/shopping-list";
import type { ShoppingListListItem } from "@/services/shopping-list-service";

type SerializedList = Omit<ShoppingListListItem, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

interface ShoppingListsClientProps {
  initialLists: SerializedList[];
  /** When provided (e.g. in AI panel), used instead of router.refresh() */
  onRefresh?: () => void | Promise<void>;
}

export function ShoppingListsClient({ initialLists, onRefresh }: ShoppingListsClientProps) {
  const t = useTranslations("shoppingList");
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      await createShoppingList({ title: newTitle.trim() });
      setNewTitle("");
      setShowCreate(false);
      router.refresh();
    });
  };

  const handleRefresh = () => {
    if (onRefresh) {
      void Promise.resolve(onRefresh());
    } else {
      router.refresh();
    }
  };

  // Convert serialized dates back to Date objects for ShoppingListCard
  const lists: ShoppingListListItem[] = initialLists.map((l) => ({
    ...l,
    createdAt: new Date(l.createdAt),
    updatedAt: new Date(l.updatedAt),
  }));

  return (
    <div className="space-y-4">
      {/* Create new list */}
      {showCreate ? (
        <div className="flex gap-2">
          <Input
            placeholder={t("listTitle")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowCreate(false);
            }}
            autoFocus
            disabled={isPending}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isPending || !newTitle.trim()}
          >
            {t("createList")}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("newList")}
        </Button>
      )}

      {/* Lists */}
      {lists.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("emptyState")}
        </p>
      )}

      <div className="space-y-3">
        {lists.map((list) => (
          <ShoppingListCard
            key={list.id}
            list={list}
            onRefresh={handleRefresh}
          />
        ))}
      </div>
    </div>
  );
}
