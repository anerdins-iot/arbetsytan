"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Send, Check, X, FileText, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { QuoteStatusBadge } from "./quote-status-badge";
import { QuoteItemRow } from "./quote-item-row";
import { updateQuoteStatus, deleteQuote, generateQuotePdf } from "@/actions/quotes";
import type { QuoteDetail as QuoteDetailType } from "@/services/quote-service";
import { Link } from "@/i18n/routing";

type SerializedQuoteDetail = Omit<
  QuoteDetailType,
  "createdAt" | "updatedAt" | "validUntil" | "sentAt" | "acceptedAt" | "rejectedAt" | "items"
> & {
  createdAt: string;
  updatedAt: string;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  items: Array<Omit<QuoteDetailType["items"][number], "createdAt"> & { createdAt: string }>;
};

interface QuoteDetailProps {
  quote: SerializedQuoteDetail;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

export function QuoteDetailView({ quote }: QuoteDetailProps) {
  const t = useTranslations("quotes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pdfPending, setPdfPending] = useState(false);

  const handleStatusChange = (status: string) => {
    startTransition(async () => {
      await updateQuoteStatus(quote.id, status);
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteQuote(quote.id);
      if (result.success) {
        router.push("/quotes");
      }
    });
  };

  const handleGeneratePdf = async () => {
    setPdfPending(true);
    try {
      await generateQuotePdf({
        projectId: quote.projectId ?? undefined,
        clientName: quote.customerName ?? "",
        clientEmail: quote.customerEmail ?? undefined,
        title: quote.title,
        items: quote.items.map((i) => ({
          description: i.name,
          quantity: i.quantity,
          unit: i.unit ?? "st",
          unitPrice: i.unitPrice,
          vatRate: quote.taxPercent / 100,
        })),
        validUntil: quote.validUntil ?? undefined,
        notes: quote.notes ?? undefined,
      });
    } finally {
      setPdfPending(false);
    }
  };

  const handleRefresh = () => {
    router.refresh();
  };

  // Convert items back to Date for QuoteItemRow
  const itemsWithDates = quote.items.map((i) => ({
    ...i,
    createdAt: new Date(i.createdAt),
  }));

  const subtotal = quote.items.reduce((sum, i) => {
    const lineTotal = i.quantity * i.unitPrice;
    const discountAmount = i.discount ? lineTotal * (i.discount / 100) : 0;
    return sum + lineTotal - discountAmount;
  }, 0);

  const laborCost = quote.laborCost ?? 0;
  const discountAmount = quote.discountPercent
    ? (subtotal + laborCost) * (quote.discountPercent / 100)
    : 0;
  const afterDiscount = subtotal + laborCost - discountAmount;
  const taxAmount = afterDiscount * (quote.taxPercent / 100);
  const total = afterDiscount + taxAmount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/quotes">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {quote.quoteNumber}
            </span>
            <QuoteStatusBadge status={quote.status} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{quote.title}</h1>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {quote.status === "DRAFT" && (
          <Button size="sm" onClick={() => handleStatusChange("SENT")} disabled={isPending}>
            <Send className="mr-1 h-3.5 w-3.5" />
            {t("actions.send")}
          </Button>
        )}
        {quote.status === "SENT" && (
          <>
            <Button size="sm" onClick={() => handleStatusChange("ACCEPTED")} disabled={isPending}>
              <Check className="mr-1 h-3.5 w-3.5" />
              {t("actions.accept")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleStatusChange("REJECTED")}
              disabled={isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {t("actions.reject")}
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={handleGeneratePdf} disabled={pdfPending}>
          {pdfPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
          {t("actions.generatePdf")}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          {t("actions.delete")}
        </Button>
      </div>

      {/* Customer info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.customerInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {quote.customerName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("form.customerName")}</span>
              <span className="text-foreground">{quote.customerName}</span>
            </div>
          )}
          {quote.customerEmail && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("form.customerEmail")}</span>
              <span className="text-foreground">{quote.customerEmail}</span>
            </div>
          )}
          {quote.customerPhone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("form.customerPhone")}</span>
              <span className="text-foreground">{quote.customerPhone}</span>
            </div>
          )}
          {quote.customerAddress && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("form.customerAddress")}</span>
              <span className="text-foreground">{quote.customerAddress}</span>
            </div>
          )}
          {quote.validUntil && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("form.validUntil")}</span>
              <span className="text-foreground">
                {new Date(quote.validUntil).toLocaleDateString("sv-SE")}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.items")}</CardTitle>
        </CardHeader>
        <CardContent>
          {itemsWithDates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("detail.noItems")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-2">{t("items.name")}</th>
                    <th className="p-2">{t("items.articleNo")}</th>
                    <th className="p-2">{t("items.quantity")}</th>
                    <th className="p-2">{t("items.unitPrice")}</th>
                    <th className="p-2 text-right">{t("items.total")}</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {itemsWithDates.map((item) => (
                    <QuoteItemRow key={item.id} item={item} onRefresh={handleRefresh} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detail.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">{quote.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("summary.subtotal")}</span>
            <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
          </div>
          {laborCost > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("summary.laborCost")}</span>
              <span className="text-foreground">{formatCurrency(laborCost)}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("summary.discount", { percent: quote.discountPercent ?? 0 })}
              </span>
              <span className="text-foreground">-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("summary.taxWithPercent", { percent: quote.taxPercent })}
            </span>
            <span className="text-foreground">{formatCurrency(taxAmount)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-base font-semibold">
            <span className="text-foreground">{t("summary.total")}</span>
            <span className="text-foreground">{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
