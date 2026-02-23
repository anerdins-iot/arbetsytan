"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { QuoteSuggestion } from "@/services/quote-service";

interface QuoteSuggestionsPanelProps {
  suggestions: QuoteSuggestion[];
  onAdd: (suggestion: QuoteSuggestion) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

export function QuoteSuggestionsPanel({ suggestions, onAdd }: QuoteSuggestionsPanelProps) {
  const t = useTranslations("quotes");

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">
        {t("suggestions.title")}
      </h4>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={`${suggestion.name}-${suggestion.articleNo ?? ""}`}
            type="button"
            onClick={() => onAdd(suggestion)}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {suggestion.name}
              </p>
              <div className="flex items-center gap-1.5">
                {suggestion.avgPrice != null && (
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(suggestion.avgPrice)}
                  </span>
                )}
                {suggestion.articleNo && (
                  <span className="text-xs text-muted-foreground">
                    {suggestion.articleNo}
                  </span>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {t("suggestions.orderedTimes", { count: suggestion.frequency })}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
