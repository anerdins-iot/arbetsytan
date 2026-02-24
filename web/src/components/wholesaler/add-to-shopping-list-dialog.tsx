"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ShoppingCart, Check, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getShoppingLists, addShoppingListItem } from "@/actions/shopping-list";
import type { WholesalerProduct } from "@/lib/wholesaler-search";

interface AddToShoppingListDialogProps {
  product: WholesalerProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

export function AddToShoppingListDialog({
  product,
  open,
  onOpenChange,
  onAdded,
}: AddToShoppingListDialogProps) {
  const t = useTranslations("supplierSearch.addToListDialog");

  const [lists, setLists] = useState<
    { id: string; title: string; itemCount: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getShoppingLists();
      if (result.success) {
        setLists(
          result.lists.map((l) => ({
            id: l.id,
            title: l.title,
            itemCount: l.itemCount,
          }))
        );
      } else {
        setError(t("errorLoadLists"));
      }
    } catch {
      setError(t("errorLoadLists"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open && product) {
      setSuccess(null);
      setError(null);
      setAdding(null);
      fetchLists();
    }
  }, [open, product, fetchLists]);

  const handleSelect = async (listId: string, listTitle: string) => {
    if (!product || adding) return;

    setAdding(listId);
    setError(null);

    try {
      const result = await addShoppingListItem(listId, {
        name: product.name,
        articleNo: product.articleNo || undefined,
        brand: product.brand || undefined,
        supplier: product.supplier,
        quantity: 1,
        unit: product.unit || undefined,
        price: product.price ?? undefined,
        productUrl: product.productUrl || undefined,
        imageUrl: product.imageUrl || undefined,
      });

      if (result.success) {
        setSuccess(listTitle);
        onAdded?.();
        setTimeout(() => {
          onOpenChange(false);
        }, 1200);
      } else {
        setError(t("error"));
      }
    } catch {
      setError(t("error"));
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
            <Check className="h-4 w-4 shrink-0" />
            {t("added", { listTitle: success })}
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : lists.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("emptyState")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {lists.map((list) => (
              <Button
                key={list.id}
                variant="ghost"
                className="h-auto min-h-11 justify-start gap-3 px-3 py-2"
                disabled={adding !== null}
                onClick={() => handleSelect(list.id, list.title)}
              >
                {adding === list.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">{list.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("items", { count: list.itemCount })}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
