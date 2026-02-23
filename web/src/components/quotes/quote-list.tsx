"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuoteStatusBadge } from "./quote-status-badge";
import type { QuoteListItem } from "@/services/quote-service";

type SerializedQuote = Omit<QuoteListItem, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

interface QuoteListProps {
  initialQuotes: SerializedQuote[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

export function QuoteList({ initialQuotes }: QuoteListProps) {
  const t = useTranslations("quotes");
  const [tab, setTab] = useState("all");

  const filtered = tab === "all"
    ? initialQuotes
    : initialQuotes.filter((q) => q.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
              <TabsTrigger value="DRAFT">{t("tabs.draft")}</TabsTrigger>
              <TabsTrigger value="SENT">{t("tabs.sent")}</TabsTrigger>
              <TabsTrigger value="ACCEPTED">{t("tabs.accepted")}</TabsTrigger>
            </TabsList>
            <Link href="/quotes/new">
              <Button size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("newQuote")}
              </Button>
            </Link>
          </div>

          <TabsContent value={tab} className="mt-4">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("emptyState")}
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((quote) => (
                  <Link key={quote.id} href={`/quotes/${quote.id}`}>
                    <Card className="transition-colors hover:bg-accent/50">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">
                              {quote.quoteNumber}
                            </span>
                            <QuoteStatusBadge status={quote.status} />
                          </div>
                          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                            {quote.title}
                          </h3>
                          {quote.customerName && (
                            <p className="text-xs text-muted-foreground">
                              {quote.customerName}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium text-foreground">
                            {formatCurrency(quote.totalExVat)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("itemCount", { count: quote.itemCount })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(quote.createdAt).toLocaleDateString("sv-SE")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
