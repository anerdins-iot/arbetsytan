"use client";

import { useState, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { QuoteSuggestionsPanel } from "./quote-suggestions";
import { createQuote, addQuoteItem } from "@/actions/quotes";
import type { QuoteSuggestion } from "@/services/quote-service";

interface Project {
  id: string;
  name: string;
}

interface QuoteFormProps {
  projects: Project[];
  suggestions: QuoteSuggestion[];
}

interface LineItem {
  id: string;
  name: string;
  articleNo: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

export function QuoteForm({ projects, suggestions }: QuoteFormProps) {
  const t = useTranslations("quotes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSearching, setIsSearching] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  // Items
  const [items, setItems] = useState<LineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ name: string; articleNo: string; price: number | null; supplier: string }>
  >([]);

  // New item inline
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState("st");
  const [newPrice, setNewPrice] = useState(0);
  const [newArticleNo, setNewArticleNo] = useState("");

  const addItem = useCallback(
    (item: Omit<LineItem, "id">) => {
      setItems((prev) => [
        ...prev,
        { ...item, id: crypto.randomUUID() },
      ]);
    },
    []
  );

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAddInline = () => {
    if (!newName.trim() || newPrice <= 0) return;
    addItem({
      name: newName.trim(),
      articleNo: newArticleNo,
      quantity: newQty,
      unit: newUnit,
      unitPrice: newPrice,
    });
    setNewName("");
    setNewQty(1);
    setNewUnit("st");
    setNewPrice(0);
    setNewArticleNo("");
  };

  const handleSuggestionAdd = (suggestion: QuoteSuggestion) => {
    addItem({
      name: suggestion.name,
      articleNo: suggestion.articleNo ?? "",
      quantity: 1,
      unit: suggestion.unit ?? "st",
      unitPrice: suggestion.avgPrice ?? 0,
    });
  };

  const handleSearchWholesaler = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/wholesaler/search?query=${encodeURIComponent(searchQuery.trim())}&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        const products = [
          ...(data.elektroskandia?.products ?? []),
          ...(data.ahlsell?.products ?? []),
        ];
        setSearchResults(
          products.map((p: { name: string; articleNo: string; price: number | null; supplier: string }) => ({
            name: p.name,
            articleNo: p.articleNo,
            price: p.price,
            supplier: p.supplier,
          }))
        );
      }
    } catch {
      // Ignore search errors
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSearchResult = (result: { name: string; articleNo: string; price: number | null; supplier: string }) => {
    addItem({
      name: result.name,
      articleNo: result.articleNo,
      quantity: 1,
      unit: "st",
      unitPrice: result.price ?? 0,
    });
  };

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const taxAmount = subtotal * 0.25;
  const total = subtotal + taxAmount;

  const handleSubmit = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createQuote({
        title: title.trim(),
        projectId: projectId || undefined,
        customerName: customerName || undefined,
        customerEmail: customerEmail || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
      });

      if (!result.success) return;

      // Add items to the quote
      for (const item of items) {
        await addQuoteItem(result.quoteId, {
          name: item.name,
          articleNo: item.articleNo || undefined,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        });
      }

      router.push(`/quotes/${result.quoteId}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Customer info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.customerInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("form.title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("form.titlePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.project")}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("form.noProject")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("form.noProject")}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("form.customerName")}</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.customerEmail")}</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("form.customerPhone")}</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.validUntil")}</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("form.customerAddress")}</Label>
            <Input
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* History suggestions */}
      <QuoteSuggestionsPanel suggestions={suggestions} onAdd={handleSuggestionAdd} />

      {/* Wholesaler search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.searchWholesaler")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder={t("form.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchWholesaler();
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleSearchWholesaler}
              disabled={isSearching}
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r, i) => (
                <button
                  key={`${r.articleNo}-${i}`}
                  type="button"
                  onClick={() => handleAddSearchResult(r)}
                  className="flex w-full items-center justify-between rounded-md border border-border p-2 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.supplier} | {r.articleNo}
                    </p>
                  </div>
                  {r.price != null && (
                    <span className="shrink-0 text-sm font-medium text-foreground">
                      {formatCurrency(r.price)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.items")}</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 && (
            <div className="mb-4 overflow-x-auto">
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
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border">
                      <td className="p-2 text-foreground">{item.name}</td>
                      <td className="p-2 text-muted-foreground">{item.articleNo}</td>
                      <td className="p-2 text-foreground">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="p-2 text-foreground">{formatCurrency(item.unitPrice)}</td>
                      <td className="p-2 text-right font-medium text-foreground">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeItem(item.id)}
                        >
                          <span className="text-xs text-muted-foreground">✕</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add item inline */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder={t("items.name")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddInline();
              }}
            />
            <Input
              placeholder={t("items.articleNo")}
              value={newArticleNo}
              onChange={(e) => setNewArticleNo(e.target.value)}
              className="h-8 w-24 text-sm"
            />
            <Input
              type="number"
              placeholder={t("items.quantity")}
              value={newQty}
              onChange={(e) => setNewQty(Number(e.target.value))}
              className="h-8 w-16 text-sm"
            />
            <Input
              placeholder={t("items.unit")}
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              className="h-8 w-16 text-sm"
            />
            <Input
              type="number"
              placeholder={t("items.unitPrice")}
              value={newPrice}
              onChange={(e) => setNewPrice(Number(e.target.value))}
              className="h-8 w-24 text-sm"
            />
            <Button variant="outline" size="sm" className="h-8" onClick={handleAddInline}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("form.addItem")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.notes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("form.notesPlaceholder")}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("summary.subtotal")}</span>
            <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("summary.tax")}</span>
            <span className="text-foreground">{formatCurrency(taxAmount)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-base font-semibold">
            <span className="text-foreground">{t("summary.total")}</span>
            <span className="text-foreground">{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          {t("form.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {t("form.create")}
        </Button>
      </div>
    </div>
  );
}
