"use client";

import { ShoppingBag, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import type { WholesalerProduct } from "@/lib/wholesaler-search";

interface ProductCardProps {
  product: WholesalerProduct;
  onAddToList: (product: WholesalerProduct) => void;
}

export function ProductCard({ product, onAddToList }: ProductCardProps) {
  const t = useTranslations("supplierSearch");

  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <ShoppingBag
          className={`h-8 w-8 text-muted-foreground ${product.imageUrl ? "hidden" : ""}`}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {product.brand && <span>{product.brand}</span>}
          {product.articleNo && (
            <span>
              {t("articleNo")}: {product.articleNo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={
              product.supplier === "ELEKTROSKANDIA"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
            }
          >
            {product.supplier === "ELEKTROSKANDIA"
              ? t("supplier.elektroskandia")
              : t("supplier.ahlsell")}
          </Badge>
          {product.price != null && (
            <span className="text-xs font-medium text-foreground">
              {product.price.toLocaleString("sv-SE")} kr
            </span>
          )}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-center"
        onClick={() => onAddToList(product)}
      >
        <ShoppingCart className="mr-1 h-3.5 w-3.5" />
        {t("addToList")}
      </Button>
    </div>
  );
}
