"use client";

import { useState, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { WholesalerSearchResults } from "./wholesaler-search-results";
import type { WholesalerProduct, WholesalerSearchResult } from "@/lib/wholesaler-search";

interface WholesalerSearchUIProps {
  onAddToList?: (product: WholesalerProduct) => void;
}

export function WholesalerSearchUI({ onAddToList }: WholesalerSearchUIProps) {
  const t = useTranslations("supplierSearch");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    elektroskandia: WholesalerSearchResult | null;
    ahlsell: WholesalerSearchResult | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setSearchedQuery("");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/wholesaler/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
      setSearchedQuery(q);
    } catch {
      setResults(null);
    } finally {
      setIsLoading(false);
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

  const elektroskandiaProducts = results?.elektroskandia?.products ?? [];
  const ahlsellProducts = results?.ahlsell?.products ?? [];
  const hasResults = elektroskandiaProducts.length > 0 || ahlsellProducts.length > 0;
  const hasSearched = searchedQuery.length > 0;

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && hasSearched && !hasResults && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("noResults", { query: searchedQuery })}
        </p>
      )}

      {!isLoading && hasResults && (
        <WholesalerSearchResults
          products={[...elektroskandiaProducts, ...ahlsellProducts]}
          onAddToList={handleAddToList}
        />
      )}
    </div>
  );
}
