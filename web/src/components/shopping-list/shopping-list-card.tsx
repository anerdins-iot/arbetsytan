"use client";

import { useState, useTransition, useCallback } from "react";
import { Archive, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { ShoppingListView } from "./shopping-list-view";
import {
  updateShoppingList,
  deleteShoppingList,
  getShoppingList,
} from "@/actions/shopping-list";
import type {
  ShoppingListListItem,
  ShoppingListDetail,
} from "@/services/shopping-list-service";

interface ShoppingListCardProps {
  list: ShoppingListListItem;
  onRefresh: () => void;
}

export function ShoppingListCard({ list, onRefresh }: ShoppingListCardProps) {
  const t = useTranslations("shoppingList");
  const [isExpanded, setIsExpanded] = useState(false);
  const [detail, setDetail] = useState<ShoppingListDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  const progress = list.itemCount > 0 ? Math.round((list.checkedCount / list.itemCount) * 100) : 0;

  const loadDetail = useCallback(async () => {
    const result = await getShoppingList(list.id);
    if (result.success) {
      setDetail(result.list);
    }
  }, [list.id]);

  const handleExpand = () => {
    if (!isExpanded) {
      startTransition(async () => {
        await loadDetail();
        setIsExpanded(true);
      });
    } else {
      setIsExpanded(false);
    }
  };

  const handleArchive = () => {
    startTransition(async () => {
      await updateShoppingList(list.id, { isArchived: !list.isArchived });
      onRefresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteShoppingList(list.id);
      onRefresh();
    });
  };

  const handleRefreshDetail = () => {
    startTransition(async () => {
      await loadDetail();
      onRefresh();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={handleExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          disabled={isPending}
        >
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {list.title}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("progress", { checked: list.checkedCount, total: list.itemCount })}
            </p>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleArchive}
            disabled={isPending}
            title={t("archiveList")}
          >
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDelete}
            disabled={isPending}
            title={t("deleteList")}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {list.itemCount > 0 && (
        <div className="px-4 pb-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {isExpanded && detail && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <ShoppingListView list={detail} onRefresh={handleRefreshDetail} />
        </div>
      )}
    </div>
  );
}
