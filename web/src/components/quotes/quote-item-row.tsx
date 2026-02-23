"use client";

import { useState, useTransition } from "react";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { updateQuoteItem, deleteQuoteItem } from "@/actions/quotes";
import type { QuoteItemType } from "@/services/quote-service";

interface QuoteItemRowProps {
  item: QuoteItemType;
  onRefresh: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

export function QuoteItemRow({ item, onRefresh }: QuoteItemRowProps) {
  const t = useTranslations("quotes");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editData, setEditData] = useState({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unit: item.unit ?? "",
  });

  const lineTotal = item.quantity * item.unitPrice;
  const discountAmount = item.discount ? lineTotal * (item.discount / 100) : 0;
  const finalTotal = lineTotal - discountAmount;

  const handleSave = () => {
    startTransition(async () => {
      await updateQuoteItem(item.id, {
        name: editData.name,
        quantity: editData.quantity,
        unitPrice: editData.unitPrice,
        unit: editData.unit || undefined,
      });
      setIsEditing(false);
      onRefresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteQuoteItem(item.id);
      onRefresh();
    });
  };

  if (isEditing) {
    return (
      <tr className="border-b border-border">
        <td className="p-2">
          <Input
            value={editData.name}
            onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
            className="h-8 text-sm"
            disabled={isPending}
          />
        </td>
        <td className="p-2">
          <span className="text-xs text-muted-foreground">{item.articleNo}</span>
        </td>
        <td className="p-2">
          <Input
            type="number"
            value={editData.quantity}
            onChange={(e) => setEditData((d) => ({ ...d, quantity: Number(e.target.value) }))}
            className="h-8 w-20 text-sm"
            disabled={isPending}
          />
        </td>
        <td className="p-2">
          <Input
            type="number"
            value={editData.unitPrice}
            onChange={(e) => setEditData((d) => ({ ...d, unitPrice: Number(e.target.value) }))}
            className="h-8 w-24 text-sm"
            disabled={isPending}
          />
        </td>
        <td className="p-2 text-right text-sm text-foreground">
          {formatCurrency(editData.quantity * editData.unitPrice)}
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={isPending}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditing(false)} disabled={isPending}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border">
      <td className="p-2 text-sm text-foreground">{item.name}</td>
      <td className="p-2 text-xs text-muted-foreground">{item.articleNo}</td>
      <td className="p-2 text-sm text-foreground">
        {item.quantity} {item.unit ?? t("items.defaultUnit")}
      </td>
      <td className="p-2 text-sm text-foreground">{formatCurrency(item.unitPrice)}</td>
      <td className="p-2 text-right text-sm font-medium text-foreground">
        {formatCurrency(finalTotal)}
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditing(true)} disabled={isPending}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
