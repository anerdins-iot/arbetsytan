"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import {
  toggleShoppingListItem,
  deleteShoppingListItem,
  addShoppingListItem,
} from "@/actions/shopping-list";
import type { ShoppingListDetail } from "@/services/shopping-list-service";

interface ShoppingListViewProps {
  list: ShoppingListDetail;
  onRefresh: () => void;
}

export function ShoppingListView({ list, onRefresh }: ShoppingListViewProps) {
  const t = useTranslations("shoppingList");
  const [newItemName, setNewItemName] = useState("");
  const [isPending, startTransition] = useTransition();

  const uncheckedItems = list.items.filter((item) => !item.isChecked);
  const checkedItems = list.items.filter((item) => item.isChecked);

  const totalPrice = uncheckedItems.reduce(
    (sum, item) => sum + (item.price ?? 0) * item.quantity,
    0
  );

  const handleToggle = (itemId: string) => {
    startTransition(async () => {
      await toggleShoppingListItem(itemId);
      onRefresh();
    });
  };

  const handleDelete = (itemId: string) => {
    startTransition(async () => {
      await deleteShoppingListItem(itemId);
      onRefresh();
    });
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    startTransition(async () => {
      await addShoppingListItem(list.id, { name: newItemName.trim() });
      setNewItemName("");
      onRefresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* Unchecked items */}
      {uncheckedItems.length === 0 && checkedItems.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("emptyListState")}
        </p>
      )}

      <div className="space-y-1">
        {uncheckedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            <Checkbox
              checked={false}
              onCheckedChange={() => handleToggle(item.id)}
              disabled={isPending}
            />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm text-foreground">{item.name}</span>
              {item.quantity > 1 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  x{item.quantity}
                </span>
              )}
              {item.supplier && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({item.supplier})
                </span>
              )}
            </div>
            {item.price != null && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {(item.price * item.quantity).toLocaleString("sv-SE")} kr
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => handleDelete(item.id)}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      {/* Checked items */}
      {checkedItems.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="px-2 text-xs text-muted-foreground">
            {checkedItems.length} {t("checkedItems")}
          </p>
          {checkedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 opacity-50 hover:bg-muted/50"
            >
              <Checkbox
                checked={true}
                onCheckedChange={() => handleToggle(item.id)}
                disabled={isPending}
              />
              <span className="flex-1 truncate text-sm text-foreground line-through">
                {item.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => handleDelete(item.id)}
                disabled={isPending}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add item input */}
      <div className="flex gap-2 border-t border-border pt-3">
        <Input
          placeholder={t("addItemPlaceholder")}
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddItem();
          }}
          disabled={isPending}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          disabled={isPending || !newItemName.trim()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("addItem")}
        </Button>
      </div>

      {/* Total price */}
      {totalPrice > 0 && (
        <div className="flex justify-end border-t border-border pt-2">
          <span className="text-sm font-semibold text-foreground">
            {t("totalPrice")}: {totalPrice.toLocaleString("sv-SE")} kr
          </span>
        </div>
      )}
    </div>
  );
}
