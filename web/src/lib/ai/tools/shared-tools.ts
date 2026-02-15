/**
 * Delade AI-verktyg som används av både projekt-AI och personlig AI.
 * Dessa verktyg innehåller gemensam logik för task CRUD, dokumentgenerering, etc.
 */
import { tool, generateText } from "ai";
import { z } from "zod";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import ExcelJS from "exceljs";
import { searchDocuments, searchDocumentsGlobal } from "@/lib/ai/embeddings";
import { saveGeneratedDocumentToProject } from "@/lib/ai/save-generated-document";
import { createPresignedDownloadUrl } from "@/lib/minio";
import { buildSimplePdf, type PdfTemplate } from "@/lib/reports/simple-content-pdf";
import { buildSimpleDocx, type DocxTemplate } from "@/lib/reports/simple-content-docx";
import { openai } from "@ai-sdk/openai";
import type { TenantScopedClient } from "@/lib/db";

// ============================================================================
// Task-hantering (gemensamt mellan projekt-AI och personlig AI)
// ============================================================================

type CreateTaskParams = {
  db: TenantScopedClient;
  projectId: string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  deadline?: string;
};

/**
 * Skapar en ny uppgift i ett projekt. Används av både projekt-AI och personlig AI.
 */
export async function createTaskShared(params: CreateTaskParams) {
  const { db, projectId, title, description, priority, deadline } = params;

  const task = await db.task.create({
    data: {
      title,
      description: description ?? null,
      priority,
      status: "TODO",
      deadline: deadline ? new Date(deadline) : null,
      projectId,
    },
  });

  return { id: task.id, title: task.title, status: task.status, message: "Uppgift skapad." };
}

type UpdateTaskParams = {
  db: TenantScopedClient;
  projectId: string;
  taskId: string;
  title?: string;
  description?: string;
  status?: "TODO" | "IN_PROGRESS" | "DONE";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  deadline?: string | null;
};

/**
 * Uppdaterar en befintlig uppgift. Används av både projekt-AI och personlig AI.
 */
export async function updateTaskShared(params: UpdateTaskParams) {
  const { db, projectId, taskId, title, description, status, priority, deadline } = params;

  const existing = await db.task.findFirst({
    where: { id: taskId, projectId },
  });
  if (!existing) return { error: "Uppgiften hittades inte i detta projekt." };

  const task = await db.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(deadline !== undefined && {
        deadline: deadline === null || deadline === "" ? null : new Date(deadline),
      }),
    },
  });

  return { id: task.id, title: task.title, status: task.status, message: "Uppgift uppdaterad." };
}

// ============================================================================
// Dokumentsökning (gemensamt mellan projekt-AI och personlig AI)
// ============================================================================

type SearchDocumentsProjectParams = {
  tenantId: string;
  projectId: string;
  query: string;
  limit: number;
};

/**
 * Söker i dokument för ett specifikt projekt (används av projekt-AI).
 */
export async function searchDocumentsForProject(params: SearchDocumentsProjectParams) {
  const { tenantId, projectId, query, limit } = params;
  const results = await searchDocuments(tenantId, projectId, query, { limit, threshold: 0.3 });
  const resultsWithUrls = await Promise.all(
    results.map(async (r) => {
      const previewUrl = await createPresignedDownloadUrl({ bucket: r.bucket, key: r.key });
      return {
        fileId: r.fileId,
        fileName: r.fileName,
        projectId,
        projectName: null as string | null,
        page: r.page,
        similarity: r.similarity,
        excerpt: r.content.slice(0, 300) + (r.content.length > 300 ? "…" : ""),
        previewUrl,
        type: r.type,
      };
    })
  );
  return {
    __searchResults: true as const,
    results: resultsWithUrls,
  };
}

type SearchDocumentsGlobalParams = {
  tenantId: string;
  projectIds: string[];
  query: string;
  limit: number;
  userId?: string;
};

/**
 * Söker i dokument över flera projekt OCH personliga filer (används av personlig AI).
 * Returnerar previewUrl (presigned) så att chatten kan rendera bilder.
 */
export async function searchDocumentsAcrossProjects(params: SearchDocumentsGlobalParams) {
  const { tenantId, projectIds, query, limit, userId } = params;
  if (projectIds.length === 0 && !userId) return { __searchResults: true as const, results: [] };
  const results = await searchDocumentsGlobal(tenantId, projectIds, query, {
    limit,
    threshold: 0.3,
    userId,
  });
  const resultsWithUrls = await Promise.all(
    results.map(async (r) => {
      const previewUrl = await createPresignedDownloadUrl({ bucket: r.bucket, key: r.key });
      return {
        fileId: r.fileId,
        fileName: r.fileName,
        projectId: r.projectId,
        projectName: r.projectName ?? "Personliga filer",
        page: r.page,
        similarity: r.similarity,
        excerpt: r.content.slice(0, 250) + (r.content.length > 250 ? "…" : ""),
        previewUrl,
        type: r.type,
      };
    })
  );
  return {
    __searchResults: true as const,
    results: resultsWithUrls,
  };
}

// ============================================================================
// Dokumentgenerering (Excel, PDF, Word)
// ============================================================================

export type ExcelTemplate = "materiallista" | null;

type ExcelSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

type GenerateExcelParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  title?: string;
  sheets?: ExcelSheet[];
  /** @deprecated Use sheets instead */
  sheetName?: string;
  /** @deprecated Use sheets instead */
  rows?: (string | number)[][];
  template?: ExcelTemplate;
};

/**
 * Genererar ett Excel-dokument (.xlsx) och sparar det i projektets fillista.
 * Supports multi-sheet via `sheets` param or legacy single-sheet via `sheetName`+`rows`.
 */
export async function generateExcelDocument(params: GenerateExcelParams) {
  const { db, tenantId, projectId, userId, fileName, title, template } = params;

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return { error: "fileName måste sluta med .xlsx" };
  }

  const workbook = new ExcelJS.Workbook();

  // Determine sheets: new multi-sheet API or legacy single-sheet
  const sheetDefs: ExcelSheet[] = params.sheets && params.sheets.length > 0
    ? params.sheets
    : [{
        name: params.sheetName ?? title ?? "Blad1",
        headers: [],
        rows: (params.rows ?? []) as (string | number)[][],
      }];

  for (const sheetDef of sheetDefs) {
    const ws = workbook.addWorksheet(sheetDef.name);

    if (sheetDef.headers.length > 0) {
      const headerRow = ws.addRow(sheetDef.headers);

      if (template === "materiallista") {
        // Bold header row with fill
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE5E7EB" },
        };
      }
    }

    for (const row of sheetDef.rows) {
      ws.addRow(row);
    }

    if (template === "materiallista") {
      // Auto-width columns
      for (let colIdx = 0; colIdx < (sheetDef.headers.length || 1); colIdx++) {
        const col = ws.getColumn(colIdx + 1);
        let maxLen = sheetDef.headers[colIdx]?.length ?? 10;
        for (const row of sheetDef.rows) {
          const cellVal = row[colIdx];
          const len = cellVal != null ? String(cellVal).length : 0;
          if (len > maxLen) maxLen = len;
        }
        col.width = Math.min(maxLen + 4, 60);
      }

      // Add summary row if there are numeric columns
      if (sheetDef.rows.length > 0) {
        const colCount = sheetDef.headers.length || (sheetDef.rows[0]?.length ?? 0);
        const sumRow: (string | number)[] = [];
        let hasNumeric = false;

        for (let c = 0; c < colCount; c++) {
          const numericValues = sheetDef.rows
            .map((r) => r[c])
            .filter((v): v is number => typeof v === "number");

          if (numericValues.length > 0) {
            hasNumeric = true;
            sumRow.push(numericValues.reduce((a, b) => a + b, 0));
          } else if (c === 0) {
            sumRow.push("Summa");
          } else {
            sumRow.push("");
          }
        }

        if (hasNumeric) {
          const summaryRow = ws.addRow(sumRow);
          summaryRow.font = { bold: true };
          summaryRow.border = {
            top: { style: "thin" },
          };
        }
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  // Extract text content from sheets for OCR
  const textParts: string[] = [];
  if (title) {
    textParts.push(title);
  }
  for (const sheet of sheetDefs) {
    textParts.push(`\n--- ${sheet.name} ---`);
    if (sheet.headers.length > 0) {
      textParts.push(sheet.headers.join(' | '));
    }
    for (const row of sheet.rows) {
      textParts.push(row.join(' | '));
    }
  }
  const textContent = textParts.join('\n');

  const saved = await saveGeneratedDocumentToProject({
    db,
    tenantId,
    projectId,
    userId,
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: new Uint8Array(buffer),
    content: textContent,
  });

  if ("error" in saved) {
    return { error: saved.error };
  }

  // Create presigned download URL
  const downloadUrl = await createPresignedDownloadUrl({
    bucket: saved.bucket,
    key: saved.key,
    expiresInSeconds: 60 * 30, // 30 minutes
  });

  return {
    __fileCreated: true as const,
    fileId: saved.fileId,
    fileName: saved.name,
    fileType: "excel" as const,
    fileSize: saved.size,
    downloadUrl,
    message: "Excel-fil skapad och redo att laddas ner",
  };
}

type GeneratePdfParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  title: string;
  content: string;
  template?: PdfTemplate;
};

/**
 * Genererar ett PDF-dokument och sparar det i projektets fillista.
 */
export async function generatePdfDocument(params: GeneratePdfParams) {
  const { db, tenantId, projectId, userId, fileName, title, content, template } = params;

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return { error: "fileName måste sluta med .pdf" };
  }

  const buffer = await buildSimplePdf(title, content, template ?? undefined);
  const saved = await saveGeneratedDocumentToProject({
    db,
    tenantId,
    projectId,
    userId,
    fileName,
    contentType: "application/pdf",
    buffer,
    content: `${title}\n\n${content}`,
  });

  if ("error" in saved) {
    return { error: saved.error };
  }

  // Create presigned download URL (also serves as preview URL for PDFs)
  const downloadUrl = await createPresignedDownloadUrl({
    bucket: saved.bucket,
    key: saved.key,
    expiresInSeconds: 60 * 30, // 30 minutes
  });

  return {
    __fileCreated: true as const,
    fileId: saved.fileId,
    fileName: saved.name,
    fileType: "pdf" as const,
    fileSize: saved.size,
    downloadUrl,
    previewUrl: downloadUrl, // PDFs can be previewed directly
    message: "PDF skapad och redo att laddas ner",
  };
}

type GenerateWordParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  title: string;
  content?: string;
  /** @deprecated Use content instead */
  paragraphs?: string[];
  template?: DocxTemplate;
};

/**
 * Genererar ett Word-dokument (.docx) och sparar det i projektets fillista.
 */
export async function generateWordDocument(params: GenerateWordParams) {
  const { db, tenantId, projectId, userId, fileName, title, content, paragraphs, template } = params;

  if (!fileName.toLowerCase().endsWith(".docx")) {
    return { error: "fileName måste sluta med .docx" };
  }

  // Support both new content string and legacy paragraphs array
  const contentOrParagraphs = content ?? paragraphs ?? [];
  const buffer = await buildSimpleDocx(title, contentOrParagraphs, template ?? undefined);

  // Extract text content for OCR
  const textContent = typeof contentOrParagraphs === 'string'
    ? `${title}\n\n${contentOrParagraphs}`
    : `${title}\n\n${contentOrParagraphs.join('\n\n')}`;

  const saved = await saveGeneratedDocumentToProject({
    db,
    tenantId,
    projectId,
    userId,
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
    content: textContent,
  });

  if ("error" in saved) {
    return { error: saved.error };
  }

  // Create presigned download URL
  const downloadUrl = await createPresignedDownloadUrl({
    bucket: saved.bucket,
    key: saved.key,
    expiresInSeconds: 60 * 30, // 30 minutes
  });

  return {
    __fileCreated: true as const,
    fileId: saved.fileId,
    fileName: saved.name,
    fileType: "word" as const,
    fileSize: saved.size,
    downloadUrl,
    message: "Word-dokument skapat och redo att laddas ner",
  };
}

// ============================================================================
// Tool wrappers (används av projekt-AI och personlig AI för att skapa verktyg)
// ============================================================================

type SharedToolsContext = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
  projectId: string;
};

/**
 * Skapar ett createTask-verktyg för projekt-AI.
 */
export function createCreateTaskTool(ctx: SharedToolsContext) {
  const { db, projectId } = ctx;
  return tool({
    description:
      "Skapa en ny uppgift i projektet. Ange titel, valfritt beskrivning, prioritet (LOW, MEDIUM, HIGH, URGENT) och valfritt deadline (ISO-datum).",
    inputSchema: toolInputSchema(z.object({
      title: z.string().describe("Uppgiftens titel"),
      description: z.string().optional().describe("Beskrivning av uppgiften"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      deadline: z.string().optional().describe("Deadline i ISO-format (YYYY-MM-DD)"),
    })),
    execute: async ({ title, description, priority, deadline }) => {
      return createTaskShared({
        db,
        projectId,
        title,
        description,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        deadline,
      });
    },
  });
}

/**
 * Skapar ett updateTask-verktyg för projekt-AI.
 */
export function createUpdateTaskTool(ctx: SharedToolsContext) {
  const { db, projectId } = ctx;
  return tool({
    description:
      "Uppdatera en befintlig uppgift. Ange taskId och de fält som ska ändras (title, description, status, priority, deadline).",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("Uppgiftens ID"),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      deadline: z.string().optional().nullable(),
    })),
    execute: async ({ taskId, title, description, status, priority, deadline }) => {
      return updateTaskShared({
        db,
        projectId,
        taskId,
        title,
        description,
        status: status as "TODO" | "IN_PROGRESS" | "DONE" | undefined,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined,
        deadline,
      });
    },
  });
}

/**
 * Skapar ett searchProjectDocuments-verktyg för projekt-AI.
 */
export function createSearchProjectDocumentsTool(ctx: SharedToolsContext) {
  const { tenantId, projectId } = ctx;
  return tool({
    description:
      "Söka i projektets dokument (PDF, ritningar) via semantisk sökning. Ange en fråga eller sökord; returnerar relevanta textutdrag från dokument.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökfråga eller nyckelord"),
      limit: z.number().min(1).max(20).optional().default(10),
    })),
    execute: async ({ query, limit }) => {
      return searchDocumentsForProject({ tenantId, projectId, query, limit });
    },
  });
}

/**
 * Skapar ett generateExcelDocument-verktyg.
 */
export function createGenerateExcelDocumentTool(ctx: SharedToolsContext) {
  const { db, tenantId, projectId, userId } = ctx;
  return tool({
    description:
      "Generera en Excel-fil (.xlsx) och spara i projektets fillista. Ange filnamn, valfri titel och ett eller flera blad (sheets). Varje blad har namn, rubrikrad (headers) och datarader (rows). Valfritt: template 'materiallista' för formaterad tabell med fet rubrikrad, anpassade kolumnbredder och summeringsrad.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn t.ex. materiallista.xlsx"),
      title: z.string().optional().describe("Dokumenttitel"),
      sheets: z.array(z.object({
        name: z.string().describe("Bladnamn"),
        headers: z.array(z.string()).describe("Rubrikrad"),
        rows: z.array(z.array(z.union([z.string(), z.number()]))).describe("Datarader"),
      })).describe("Blad med data"),
      template: z.enum(["materiallista"]).optional().nullable()
        .describe("Layout-mall: materiallista (formaterad tabell) eller null för standard"),
    })),
    execute: async ({ fileName, title, sheets, template }) => {
      return generateExcelDocument({
        db, tenantId, projectId, userId, fileName, title,
        sheets, template: template ?? null,
      });
    },
  });
}

/**
 * Skapar ett generatePdfDocument-verktyg.
 */
export function createGeneratePdfDocumentTool(ctx: SharedToolsContext) {
  const { db, tenantId, projectId, userId } = ctx;
  return tool({
    description:
      "Generera en PDF-fil och spara i projektets fillista. Ange filnamn (.pdf), titel och innehåll (markdown eller text; stycken separeras med dubbla radbrytningar, rubriker med #). Valfritt: template för layout – projektrapport (header, sektioner, footer), offert (villkor i footer), protokoll (deltagarlista-format), eller null för fritt format.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn t.ex. rapport.pdf"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().describe("Brödtext i markdown eller vanlig text"),
      template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
        .describe("Layout-mall eller null för fritt format"),
    })),
    execute: async ({ fileName, title, content, template }) => {
      return generatePdfDocument({
        db, tenantId, projectId, userId, fileName, title, content,
        template: template ?? null,
      });
    },
  });
}

/**
 * Skapar ett generateWordDocument-verktyg.
 */
export function createGenerateWordDocumentTool(ctx: SharedToolsContext) {
  const { db, tenantId, projectId, userId } = ctx;
  return tool({
    description:
      "Generera ett Word-dokument (.docx) och spara i projektets fillista. Ange filnamn (.docx), titel och innehåll (markdown eller text; stycken separeras med dubbla radbrytningar). Valfritt: template för layout – projektrapport, offert, protokoll, eller null för fritt format.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn t.ex. offert.docx"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().describe("Brödtext, stycken separeras med dubbla radbrytningar"),
      template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
        .describe("Layout-mall eller null för fritt format"),
    })),
    execute: async ({ fileName, title, content, template }) => {
      return generateWordDocument({
        db, tenantId, projectId, userId, fileName, title, content,
        template: template ?? null,
      });
    },
  });
}

// ============================================================================
// Schedule parsing (natural language → triggerAt + recurrence)
// ============================================================================

/**
 * Parse natural language schedule text into triggerAt (Date) and optional cron recurrence.
 * Supports Swedish and English phrases.
 * Timezone is used to resolve "today", "tomorrow" and time (e.g. "kl 8").
 *
 * Examples:
 * - "imorgon kl 8" / "tomorrow at 8" → triggerAt = tomorrow 08:00, recurrence = null
 * - "om 2 timmar" / "in 2 hours" → triggerAt = now + 2h, recurrence = null
 * - "varje dag kl 9" / "every day at 9" → triggerAt = next 09:00, recurrence = "0 9 * * *"
 * - "varje måndag kl 8" / "every Monday at 8" → triggerAt = next Monday 08:00, recurrence = "0 8 * * 1"
 * - "kl 15:30" → triggerAt = today or tomorrow 15:30 depending on current time
 */
export function parseScheduleFromText(
  text: string,
  timezone: string
): { triggerAt: Date; recurrence: string | null } | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;

  const now = new Date();

  // Helper: get (year, month 1-based, day, hour, minute) in timezone for a given UTC timestamp
  function getLocalInTz(utcDate: Date): { y: number; m: number; d: number; h: number; min: number } {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(utcDate);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? 0);
    return {
      y: get("year"),
      m: get("month"),
      d: get("day"),
      h: get("hour"),
      min: get("minute"),
    };
  }

  // Helper: build UTC Date from (y, m, d, h, min) in timezone
  function buildDateInTz(y: number, m: number, d: number, h: number, min: number): Date {
    const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0));
    const local = getLocalInTz(noonUtc);
    const offsetHours = local.h - 12;
    const offsetMinutes = local.min - 0;
    return new Date(Date.UTC(y, m - 1, d, h - offsetHours, min - offsetMinutes));
  }

  // "in X hours" / "om X timmar"
  const inHoursMatch = raw.match(
    /(?:om|in)\s+(\d+)\s*(?:timmar|hours?|h)(?:\s|$)/i
  );
  if (inHoursMatch) {
    const hours = Math.min(168, Math.max(0, parseInt(inHoursMatch[1]!, 10) || 0));
    const triggerAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return { triggerAt, recurrence: null };
  }

  // "in X minutes" / "om X minuter"
  const inMinutesMatch = raw.match(
    /(?:om|in)\s+(\d+)\s*(?:minuter|minutes?|min)(?:\s|$)/i
  );
  if (inMinutesMatch) {
    const minutes = Math.min(10080, Math.max(0, parseInt(inMinutesMatch[1]!, 10) || 0));
    const triggerAt = new Date(now.getTime() + minutes * 60 * 1000);
    return { triggerAt, recurrence: null };
  }

  // Parse time: "kl 8", "kl 9:30", "at 15:30", "8:00", "9am"
  function parseTime(s: string): { h: number; min: number } | null {
    const klMatch = s.match(/(?:kl|at|@)\s*(\d{1,2})(?::(\d{2}))?(?:\s*(?:am|pm))?/i);
    if (klMatch) {
      let h = parseInt(klMatch[1]!, 10);
      const min = klMatch[2] ? parseInt(klMatch[2], 10) : 0;
      if (s.includes("pm") && h < 12) h += 12;
      if (s.includes("am") && h === 12) h = 0;
      return { h: Math.min(23, h), min: Math.min(59, min) };
    }
    const plainMatch = s.match(/(\d{1,2}):(\d{2})/);
    if (plainMatch) {
      const h = Math.min(23, parseInt(plainMatch[1]!, 10));
      const min = Math.min(59, parseInt(plainMatch[2]!, 10));
      return { h, min };
    }
    const hourOnly = s.match(/(?:^|\s)(\d{1,2})(?:\s|$)/);
    if (hourOnly) {
      const h = Math.min(23, parseInt(hourOnly[1]!, 10));
      return { h, min: 0 };
    }
    return null;
  }

  const timePart = parseTime(raw) ?? parseTime(text);
  const hourMin = timePart ?? { h: 9, min: 0 };

  const today = getLocalInTz(now);

  // Day of week (0=Sun .. 6=Sat) in timezone for a given UTC date
  function getDayOfWeekInTz(utcDate: Date): number {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const short = formatter.format(utcDate);
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[short] ?? 0;
  }

  // "every day at X" / "varje dag kl X" — cron: minute hour day month dow
  if (/\b(?:varje\s+dag|every\s+day|daily)\b/i.test(raw)) {
    let runAt = buildDateInTz(today.y, today.m, today.d, hourMin.h, hourMin.min);
    if (runAt.getTime() <= now.getTime()) {
      runAt = new Date(runAt.getTime() + 24 * 60 * 60 * 1000);
    }
    const recurrence = `${hourMin.min} ${hourMin.h} * * *`;
    return { triggerAt: runAt, recurrence };
  }

  // "every Monday at X" / "varje måndag kl X" (cron: 0 = Sunday, 1 = Monday, ...)
  const weekdays: Record<string, number> = {
    söndag: 0, sunday: 0,
    måndag: 1, monday: 1, mon: 1,
    tisdag: 2, tuesday: 2, tue: 2,
    onsdag: 3, wednesday: 3, wed: 3,
    torsdag: 4, thursday: 4, thu: 4,
    fredag: 5, friday: 5, fri: 5,
    lördag: 6, saturday: 6, sat: 6,
  };
  for (const [name, dow] of Object.entries(weekdays)) {
    const re = new RegExp(`(?:varje|every)\\s+${name}\\b`, "i");
    if (re.test(raw)) {
      // Next occurrence of that weekday (use TZ for current day of week)
      const currentDow = getDayOfWeekInTz(now);
      let daysAhead = (dow - currentDow + 7) % 7;
      if (daysAhead === 0) {
        const runToday = buildDateInTz(today.y, today.m, today.d, hourMin.h, hourMin.min);
        if (runToday.getTime() <= now.getTime()) daysAhead = 7;
      }
      const next = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      const nextLocal = getLocalInTz(next);
      const runAt = buildDateInTz(nextLocal.y, nextLocal.m, nextLocal.d, hourMin.h, hourMin.min);
      const recurrence = `${hourMin.min} ${hourMin.h} * * ${dow}`;
      return { triggerAt: runAt, recurrence };
    }
  }

  // "tomorrow at X" / "imorgon kl X"
  if (/\b(?:imorgon|tomorrow)\b/i.test(raw)) {
    const tomorrowUtc = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowLocal = getLocalInTz(tomorrowUtc);
    const triggerAt = buildDateInTz(
      tomorrowLocal.y,
      tomorrowLocal.m,
      tomorrowLocal.d,
      hourMin.h,
      hourMin.min
    );
    return { triggerAt, recurrence: null };
  }

  // "today at X" / "idag kl X"
  if (/\b(?:idag|today)\b/i.test(raw)) {
    const triggerAt = buildDateInTz(today.y, today.m, today.d, hourMin.h, hourMin.min);
    if (triggerAt.getTime() <= now.getTime()) {
      const tomorrowUtc = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowLocal = getLocalInTz(tomorrowUtc);
      return {
        triggerAt: buildDateInTz(
          tomorrowLocal.y,
          tomorrowLocal.m,
          tomorrowLocal.d,
          hourMin.h,
          hourMin.min
        ),
        recurrence: null,
      };
    }
    return { triggerAt, recurrence: null };
  }

  // Just time: "kl 15:30" → today or tomorrow
  if (timePart) {
    let runAt = buildDateInTz(today.y, today.m, today.d, hourMin.h, hourMin.min);
    if (runAt.getTime() <= now.getTime()) {
      const tomorrowUtc = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowLocal = getLocalInTz(tomorrowUtc);
      runAt = buildDateInTz(
        tomorrowLocal.y,
        tomorrowLocal.m,
        tomorrowLocal.d,
        hourMin.h,
        hourMin.min
      );
    }
    return { triggerAt: runAt, recurrence: null };
  }

  return null;
}
