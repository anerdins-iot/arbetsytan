"use client";

import { useTranslations } from "next-intl";
import { ProductCard } from "./product-card";
import type { WholesalerProduct } from "@/lib/wholesaler-search";

interface WholesalerSearchResultsProps {
  products: WholesalerProduct[];
  onAddToList: (product: WholesalerProduct) => void;
}

export function WholesalerSearchResults({
  products,
  onAddToList,
}: WholesalerSearchResultsProps) {
  const t = useTranslations("supplierSearch");

  const elektroskandiaProducts = products.filter(
    (p) => p.supplier === "ELEKTROSKANDIA"
  );
  const ahlsellProducts = products.filter((p) => p.supplier === "AHLSELL");

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {elektroskandiaProducts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("supplier.elektroskandia")} ({elektroskandiaProducts.length})
          </h3>
          <div className="grid gap-3">
            {elektroskandiaProducts.map((product) => (
              <ProductCard
                key={`e-${product.articleNo}`}
                product={product}
                onAddToList={onAddToList}
              />
            ))}
          </div>
        </div>
      )}

      {ahlsellProducts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("supplier.ahlsell")} ({ahlsellProducts.length})
          </h3>
          <div className="grid gap-3">
            {ahlsellProducts.map((product) => (
              <ProductCard
                key={`a-${product.articleNo}`}
                product={product}
                onAddToList={onAddToList}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
