import { tenantDb } from "@/lib/db";
import type { QuoteStatus } from "../../generated/prisma/client";
import type { ServiceContext } from "./types";

// ─── Types ─────────────────────────────────────────────

export interface QuoteSuggestion {
  name: string;
  articleNo: string | null;
  brand: string | null;
  supplier: string | null;
  unit: string | null;
  avgPrice: number | null;
  frequency: number;
}

export interface QuoteListItem {
  id: string;
  quoteNumber: string;
  title: string;
  customerName: string | null;
  status: QuoteStatus;
  totalExVat: number;
  itemCount: number;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteItemType {
  id: string;
  quoteId: string;
  name: string;
  articleNo: string | null;
  brand: string | null;
  supplier: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  discount: number | null;
  imageUrl: string | null;
  productUrl: string | null;
  sortOrder: number;
  createdAt: Date;
}

export interface QuoteDetail {
  id: string;
  quoteNumber: string;
  title: string;
  description: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerId: string | null;
  status: QuoteStatus;
  validUntil: Date | null;
  notes: string | null;
  laborCost: number | null;
  discountPercent: number | null;
  taxPercent: number;
  currency: string;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  items: QuoteItemType[];
  createdBy: { id: string; name: string | null; email: string };
}

// ─── Service Functions ─────────────────────────────────

export async function getQuoteSuggestionsCore(
  ctx: ServiceContext,
  options?: { limit?: number }
): Promise<QuoteSuggestion[]> {
  const db = tenantDb(ctx.tenantId);
  const limit = options?.limit ?? 20;

  // Analyze checked ShoppingListItems to find frequently ordered products
  const checkedItems = await db.shoppingListItem.findMany({
    where: { isChecked: true },
    select: {
      name: true,
      articleNo: true,
      brand: true,
      supplier: true,
      unit: true,
      price: true,
    },
  });

  // Group by name (case-insensitive) and count frequency
  const grouped = new Map<
    string,
    {
      name: string;
      articleNo: string | null;
      brand: string | null;
      supplier: string | null;
      unit: string | null;
      prices: number[];
      frequency: number;
    }
  >();

  for (const item of checkedItems) {
    const key = item.name.toLowerCase().trim();
    const existing = grouped.get(key);
    if (existing) {
      existing.frequency += 1;
      if (item.price != null) existing.prices.push(item.price);
      // Keep the most recent data
      if (item.articleNo) existing.articleNo = item.articleNo;
      if (item.brand) existing.brand = item.brand;
      if (item.supplier) existing.supplier = item.supplier;
      if (item.unit) existing.unit = item.unit;
    } else {
      grouped.set(key, {
        name: item.name,
        articleNo: item.articleNo,
        brand: item.brand,
        supplier: item.supplier,
        unit: item.unit,
        prices: item.price != null ? [item.price] : [],
        frequency: 1,
      });
    }
  }

  // Sort by frequency descending
  const sorted = Array.from(grouped.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);

  return sorted.map((item) => ({
    name: item.name,
    articleNo: item.articleNo,
    brand: item.brand,
    supplier: item.supplier,
    unit: item.unit,
    avgPrice:
      item.prices.length > 0
        ? Math.round(
            (item.prices.reduce((s, p) => s + p, 0) / item.prices.length) * 100
          ) / 100
        : null,
    frequency: item.frequency,
  }));
}

export async function getQuotesCore(
  ctx: ServiceContext,
  options?: { status?: QuoteStatus; projectId?: string }
): Promise<QuoteListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const quotes = await db.quote.findMany({
    where: {
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.projectId ? { projectId: options.projectId } : {}),
    },
    include: {
      items: { select: { quantity: true, unitPrice: true, discount: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return quotes.map((q) => {
    const totalExVat = q.items.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice;
      const discountAmount = item.discount ? lineTotal * (item.discount / 100) : 0;
      return sum + lineTotal - discountAmount;
    }, 0);

    return {
      id: q.id,
      quoteNumber: q.quoteNumber,
      title: q.title,
      customerName: q.customerName,
      status: q.status,
      totalExVat: Math.round(totalExVat * 100) / 100,
      itemCount: q.items.length,
      projectId: q.projectId,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  });
}

export async function getQuoteCore(
  ctx: ServiceContext,
  quoteId: string
): Promise<QuoteDetail | null> {
  const db = tenantDb(ctx.tenantId);

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!quote) return null;

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    title: quote.title,
    description: quote.description,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    customerPhone: quote.customerPhone,
    customerAddress: quote.customerAddress,
    customerId: quote.customerId,
    status: quote.status,
    validUntil: quote.validUntil,
    notes: quote.notes,
    laborCost: quote.laborCost,
    discountPercent: quote.discountPercent,
    taxPercent: quote.taxPercent,
    currency: quote.currency,
    projectId: quote.projectId,
    createdById: quote.createdById,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    rejectedAt: quote.rejectedAt,
    items: quote.items,
    createdBy: quote.createdBy,
  };
}

export async function generateQuoteNumber(tenantId: string): Promise<string> {
  const db = tenantDb(tenantId);
  const year = new Date().getFullYear();

  const count = await db.quote.count({
    where: {
      quoteNumber: { startsWith: `OFF-${year}-` },
    },
  });

  const nextNumber = String(count + 1).padStart(3, "0");
  return `OFF-${year}-${nextNumber}`;
}
