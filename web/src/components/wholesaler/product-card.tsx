"use client";

import { useState } from "react";
import {
  ShoppingBag,
  ShoppingCart,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  PackageX,
  HelpCircle,
} from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);

  const supplierName =
    product.supplier === "ELEKTROSKANDIA"
      ? t("supplier.elektroskandia")
      : t("supplier.ahlsell");

  const hasExpandableContent =
    product.description || product.inStock != null || product.unit || product.productUrl;

  return (
    <div className="rounded-lg border border-border bg-card transition-shadow hover:shadow-sm">
      <div className="flex gap-3 p-3">
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
          <div className="flex items-center gap-1.5">
            {product.productUrl ? (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1 truncate"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate text-sm font-semibold text-foreground group-hover:underline">
                  {product.name}
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </a>
            ) : (
              <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
            )}
          </div>
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
              {supplierName}
            </Badge>
            {product.price != null && (
              <span className="text-xs font-medium text-foreground">
                {product.price.toLocaleString("sv-SE")} kr
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddToList(product)}
          >
            <ShoppingCart className="mr-1 h-3.5 w-3.5" />
            {t("addToList")}
          </Button>
          {hasExpandableContent && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label={expanded ? t("collapseDetails") : t("expandDetails")}
            >
              <span>{expanded ? t("collapseDetails") : t("expandDetails")}</span>
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-3 pb-3 pt-2">
            <div className="flex flex-col gap-2 text-sm">
              {product.description && (
                <p className="text-muted-foreground">{product.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs">
                {product.inStock === true && (
                  <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                    <PackageCheck className="h-3.5 w-3.5" />
                    {t("inStock")}
                  </span>
                )}
                {product.inStock === false && (
                  <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
                    <PackageX className="h-3.5 w-3.5" />
                    {t("outOfStock")}
                  </span>
                )}
                {product.inStock == null && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                    {t("stockUnknown")}
                  </span>
                )}

                {product.unit && (
                  <span className="text-muted-foreground">
                    {product.unit}
                  </span>
                )}
              </div>

              {product.productUrl && (
                <a
                  href={product.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("showProduct", { supplier: supplierName })}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
