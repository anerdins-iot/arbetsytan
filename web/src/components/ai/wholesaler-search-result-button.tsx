"use client";

import { ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface WholesalerSearchResultButtonProps {
  query: string;
  count: number;
  onOpen: () => void;
}

export function WholesalerSearchResultButton({
  query,
  count,
  onOpen,
}: WholesalerSearchResultButtonProps) {
  const t = useTranslations("supplierSearch");

  return (
    <div className="flex w-full max-w-[85%] items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <ShoppingBag className="size-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {t("panelFoundProducts", { count })}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          &ldquo;{query}&rdquo;
        </p>
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={onOpen}
        className="shrink-0 gap-1.5"
      >
        {t("openResults")}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}
