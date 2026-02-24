"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { generatePdfDocument } from "@/lib/ai/tools/shared-tools";
import { generateQuoteNumber } from "@/services/quote-service";
import { QuoteStatus } from "../../generated/prisma/client";
import type { QuotePreviewData } from "@/components/ai/quote-preview-card";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

/**
 * Generates a quote PDF from the QuotePreviewData and saves it to the project or personal files.
 */
export async function generateQuotePdf(
  data: QuotePreviewData
): Promise<{ success: boolean; error?: string; downloadUrl?: string; fileId?: string }> {
  const session = await requireAuth();
  const { tenantId, userId } = session;

  if (data.projectId) {
    await requireProject(tenantId, data.projectId, userId);
  }

  const db = tenantDb(tenantId, {
    actorUserId: userId,
    ...(data.projectId ? { projectId: data.projectId } : {}),
    tenantId,
  });

  // Build markdown content for the PDF
  const subtotal = data.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const vatRate = data.items[0]?.vatRate ?? 0.25;
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  const lines: string[] = [];
  lines.push(`## Kund: ${data.clientName}`);
  if (data.clientEmail) {
    lines.push(`E-post: ${data.clientEmail}`);
  }
  if (data.validUntil) {
    lines.push(`\nGiltig till: ${new Date(data.validUntil).toLocaleDateString("sv-SE")}`);
  }
  lines.push("");
  lines.push("## Specifikation");
  lines.push("");

  // Build table as markdown
  lines.push("| Beskrivning | Antal | Enhet | Pris | Summa |");
  lines.push("|---|---|---|---|---|");
  for (const item of data.items) {
    const lineTotal = item.quantity * item.unitPrice;
    lines.push(
      `| ${item.description} | ${item.quantity} | ${item.unit} | ${formatCurrency(item.unitPrice)} | ${formatCurrency(lineTotal)} |`
    );
  }
  lines.push("");
  lines.push(`**Delsumma:** ${formatCurrency(subtotal)}`);
  lines.push(`**Moms (${Math.round(vatRate * 100)}%):** ${formatCurrency(vatAmount)}`);
  lines.push(`**Totalt inkl. moms:** ${formatCurrency(total)}`);

  if (data.includeRot) {
    lines.push("");
    lines.push("*ROT-avdrag tillämpas enligt gällande regler.*");
  }

  if (data.notes) {
    lines.push("");
    lines.push("## Villkor och anteckningar");
    lines.push(data.notes);
  }

  const content = lines.join("\n");
  const safeTitle = data.title.replace(/[^a-zA-ZåäöÅÄÖ0-9\s-]/g, "").trim();
  const fileName = `Offert - ${safeTitle}.pdf`;

  const result = await generatePdfDocument({
    db,
    tenantId,
    projectId: data.projectId,
    userId,
    fileName,
    title: `Offert: ${data.title}`,
    content,
    template: "offert",
  });

  if ("error" in result) {
    return { success: false, error: result.error };
  }

  return { success: true, downloadUrl: result.downloadUrl, fileId: result.fileId };
}

// ─────────────────────────────────────────
// Schemas (private, not exported)
// ─────────────────────────────────────────

const createQuoteSchema = z.object({
  title: z.string().min(1).max(500),
  projectId: z.string().optional(),
  customerName: z.string().max(500).optional(),
  customerEmail: z.string().email().max(500).optional(),
  customerPhone: z.string().max(100).optional(),
  customerAddress: z.string().max(1000).optional(),
  description: z.string().max(5000).optional(),
  validUntil: z.string().optional(),
  notes: z.string().max(5000).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  laborCost: z.number().min(0).optional(),
});

const updateQuoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  customerName: z.string().max(500).optional(),
  customerEmail: z.string().email().max(500).optional(),
  customerPhone: z.string().max(100).optional(),
  customerAddress: z.string().max(1000).optional(),
  description: z.string().max(5000).optional(),
  validUntil: z.string().optional(),
  notes: z.string().max(5000).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  laborCost: z.number().min(0).optional(),
  projectId: z.string().optional(),
});

const addQuoteItemSchema = z.object({
  name: z.string().min(1).max(500),
  articleNo: z.string().max(100).optional(),
  brand: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  quantity: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().max(2000).optional(),
  productUrl: z.string().url().max(2000).optional(),
});

const updateQuoteItemSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  articleNo: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  quantity: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
  unitPrice: z.number().min(0).optional(),
  discount: z.number().min(0).max(100).optional(),
});

// ─────────────────────────────────────────
// CRUD Actions
// ─────────────────────────────────────────

export async function createQuote(
  data: {
    title: string;
    projectId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: string;
    description?: string;
    validUntil?: string;
    notes?: string;
    taxPercent?: number;
    discountPercent?: number;
    laborCost?: number;
  }
): Promise<{ success: true; quoteId: string; quoteNumber: string } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = createQuoteSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    if (parsed.data.projectId) {
      await requireProject(tenantId, parsed.data.projectId, userId);
    }

    const db = tenantDb(tenantId, { actorUserId: userId });
    const quoteNumber = await generateQuoteNumber(tenantId);

    const quote = await db.quote.create({
      data: {
        quoteNumber,
        tenantId,
        createdById: userId,
        title: parsed.data.title,
        projectId: parsed.data.projectId ?? null,
        customerName: parsed.data.customerName ?? null,
        customerEmail: parsed.data.customerEmail ?? null,
        customerPhone: parsed.data.customerPhone ?? null,
        customerAddress: parsed.data.customerAddress ?? null,
        description: parsed.data.description ?? null,
        validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
        notes: parsed.data.notes ?? null,
        taxPercent: parsed.data.taxPercent ?? 25,
        discountPercent: parsed.data.discountPercent ?? null,
        laborCost: parsed.data.laborCost ?? null,
      },
    });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true, quoteId: quote.id, quoteNumber: quote.quoteNumber };
  } catch {
    return { success: false, error: "Kunde inte skapa offert." };
  }
}

export async function updateQuote(
  quoteId: string,
  data: {
    title?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: string;
    description?: string;
    validUntil?: string;
    notes?: string;
    taxPercent?: number;
    discountPercent?: number;
    laborCost?: number;
    projectId?: string;
  }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = updateQuoteSchema.safeParse(data);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.quote.findUnique({ where: { id: quoteId } });
    if (!existing) return { success: false, error: "Offerten hittades inte." };

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.customerName !== undefined) updateData.customerName = parsed.data.customerName;
    if (parsed.data.customerEmail !== undefined) updateData.customerEmail = parsed.data.customerEmail;
    if (parsed.data.customerPhone !== undefined) updateData.customerPhone = parsed.data.customerPhone;
    if (parsed.data.customerAddress !== undefined) updateData.customerAddress = parsed.data.customerAddress;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.validUntil !== undefined) updateData.validUntil = new Date(parsed.data.validUntil);
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.taxPercent !== undefined) updateData.taxPercent = parsed.data.taxPercent;
    if (parsed.data.discountPercent !== undefined) updateData.discountPercent = parsed.data.discountPercent;
    if (parsed.data.laborCost !== undefined) updateData.laborCost = parsed.data.laborCost;
    if (parsed.data.projectId !== undefined) updateData.projectId = parsed.data.projectId;

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "Ange minst ett fält att uppdatera." };
    }

    await db.quote.update({ where: { id: quoteId }, data: updateData });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte uppdatera offert." };
  }
}

export async function addQuoteItem(
  quoteId: string,
  item: {
    name: string;
    articleNo?: string;
    brand?: string;
    supplier?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    unitPrice: number;
    discount?: number;
    imageUrl?: string;
    productUrl?: string;
  }
): Promise<{ success: true; itemId: string } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = addQuoteItemSchema.safeParse(item);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) return { success: false, error: "Offerten hittades inte." };

    // Get max sortOrder
    const maxSort = await db.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await db.quoteItem.create({
      data: {
        quoteId,
        name: parsed.data.name,
        articleNo: parsed.data.articleNo ?? null,
        brand: parsed.data.brand ?? null,
        supplier: parsed.data.supplier ?? null,
        description: parsed.data.description ?? null,
        quantity: parsed.data.quantity ?? 1,
        unit: parsed.data.unit ?? null,
        unitPrice: parsed.data.unitPrice,
        discount: parsed.data.discount ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        productUrl: parsed.data.productUrl ?? null,
        sortOrder: (maxSort?.sortOrder ?? 0) + 1,
      },
    });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true, itemId: created.id };
  } catch {
    return { success: false, error: "Kunde inte lägga till artikel." };
  }
}

export async function updateQuoteItem(
  itemId: string,
  updates: {
    name?: string;
    articleNo?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    discount?: number;
  }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = updateQuoteItemSchema.safeParse(updates);
    if (!parsed.success) return { success: false, error: "Ogiltiga data." };

    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.quoteItem.findUnique({ where: { id: itemId } });
    if (!existing) return { success: false, error: "Artikeln hittades inte." };

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.articleNo !== undefined) updateData.articleNo = parsed.data.articleNo;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.quantity !== undefined) updateData.quantity = parsed.data.quantity;
    if (parsed.data.unit !== undefined) updateData.unit = parsed.data.unit;
    if (parsed.data.unitPrice !== undefined) updateData.unitPrice = parsed.data.unitPrice;
    if (parsed.data.discount !== undefined) updateData.discount = parsed.data.discount;

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "Ange minst ett fält att uppdatera." };
    }

    await db.quoteItem.update({ where: { id: itemId }, data: updateData });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte uppdatera artikel." };
  }
}

export async function deleteQuoteItem(
  itemId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.quoteItem.findUnique({ where: { id: itemId } });
    if (!existing) return { success: false, error: "Artikeln hittades inte." };

    await db.quoteItem.delete({ where: { id: itemId } });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort artikel." };
  }
}

export async function updateQuoteStatus(
  quoteId: string,
  status: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.quote.findUnique({ where: { id: quoteId } });
    if (!existing) return { success: false, error: "Offerten hittades inte." };

    const validStatuses: Record<string, QuoteStatus> = {
      DRAFT: QuoteStatus.DRAFT,
      SENT: QuoteStatus.SENT,
      ACCEPTED: QuoteStatus.ACCEPTED,
      REJECTED: QuoteStatus.REJECTED,
      EXPIRED: QuoteStatus.EXPIRED,
    };

    const newStatus = validStatuses[status];
    if (!newStatus) return { success: false, error: "Ogiltig status." };

    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === QuoteStatus.SENT) updateData.sentAt = new Date();
    if (newStatus === QuoteStatus.ACCEPTED) updateData.acceptedAt = new Date();
    if (newStatus === QuoteStatus.REJECTED) updateData.rejectedAt = new Date();

    await db.quote.update({ where: { id: quoteId }, data: updateData });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte uppdatera status." };
  }
}

export async function deleteQuote(
  quoteId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const db = tenantDb(tenantId, { actorUserId: userId });

    const existing = await db.quote.findUnique({ where: { id: quoteId } });
    if (!existing) return { success: false, error: "Offerten hittades inte." };

    await db.quote.delete({ where: { id: quoteId } });

    revalidatePath("/[locale]/quotes", "page");
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort offert." };
  }
}
