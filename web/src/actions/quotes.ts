"use server";

import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { generatePdfDocument } from "@/lib/ai/tools/shared-tools";
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
): Promise<{ success: boolean; error?: string }> {
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

  return { success: true };
}
