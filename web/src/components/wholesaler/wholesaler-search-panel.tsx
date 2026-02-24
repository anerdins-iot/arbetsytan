"use client";

import { useState, useRef, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WholesalerSearchResults } from "./wholesaler-search-results";
import type { WholesalerProduct } from "@/lib/wholesaler-search";

interface WholesalerSearchPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  initialProducts?: WholesalerProduct[];
  onAddToList?: (product: WholesalerProduct) => void;
}

export function WholesalerSearchPanel({
  open,
  onOpenChange,
  initialQuery,
  initialProducts,
  onAddToList,
}: WholesalerSearchPanelProps) {
  const t = useTranslations("supplierSearch");

  const [query, setQuery] = useState(initialQuery ?? "");
  const [products, setProducts] = useState<WholesalerProduct[]>(
    initialProducts ?? []
  );
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!initialProducts?.length);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setProducts([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/wholesaler/search?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      const allProducts: WholesalerProduct[] = [
        ...(data.elektroskandia?.products ?? []),
        ...(data.ahlsell?.products ?? []),
      ];
      setProducts(allProducts);
      setHasSearched(true);
    } catch {
      setProducts([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleAddToList = (product: WholesalerProduct) => {
    onAddToList?.(product);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
        </div>

        <div className="py-2">
          {isSearching && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            </div>
          )}

          {!isSearching && hasSearched && products.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("noResults", { query })}
            </p>
          )}

          {!isSearching && products.length > 0 && (
            <WholesalerSearchResults
              products={products}
              onAddToList={handleAddToList}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
