"use client";

import { useState, useRef, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { WholesalerSearchResults } from "./wholesaler-search-results";
import type { WholesalerProduct } from "@/lib/wholesaler-search";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

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
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const sheetSide = isDesktop ? "right" : "bottom";

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={sheetSide}
        className={cn(
          "flex flex-col gap-0 p-0 sm:max-w-5xl",
          !isDesktop && "max-h-[85vh]"
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="shrink-0 border-b border-border px-4 pb-3 pt-2">
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

        <div className="min-h-0 flex-1 overflow-y-auto py-2 px-4">
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
      </SheetContent>
    </Sheet>
  );
}
