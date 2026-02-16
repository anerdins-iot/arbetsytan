/**
 * Delade AI-verktyg som används av både projekt-AI och personlig AI.
 * Dessa verktyg innehåller gemensam logik för task CRUD, dokumentgenerering, etc.
 */
import { tool, generateText } from "ai";
import { z } from "zod";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import Docxtemplater from "docxtemplater";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const InspectModule = require("docxtemplater/js/inspect-module.js");
import PizZip from "pizzip";
import { searchDocuments, searchDocumentsGlobal } from "@/lib/ai/embeddings";
import { saveGeneratedDocumentToProject } from "@/lib/ai/save-generated-document";
import { createPresignedDownloadUrl } from "@/lib/minio";
import { buildSimplePdf, type PdfTemplate } from "@/lib/reports/simple-content-pdf";
import { buildSimpleDocx, type DocxTemplate } from "@/lib/reports/simple-content-docx";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TenantScopedClient } from "@/lib/db";
import { fetchFileFromMinIO } from "@/lib/ai/ocr";
import { logger } from "@/lib/logger";

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
// Opus sub-agent — genererar dokumentinnehåll med Claude Opus
// ============================================================================

type OpusContentType = "pdf" | "word" | "excel";

/**
 * Använder Claude Opus 4.6 för att generera professionellt dokumentinnehåll.
 * Anropas internt av generatePdf/Word/Excel när `instructions` finns.
 * Vid fel (rate limit, API-fel) returneras null och caller faller tillbaka.
 */
async function generateContentWithOpus(opts: {
  title: string;
  instructions: string;
  template?: string | null;
  contentType: OpusContentType;
  projectData?: Record<string, unknown> | null;
}): Promise<string | null> {
  const { title, instructions, template, contentType, projectData } = opts;

  const formatGuide: Record<OpusContentType, string> = {
    pdf: "Skriv i markdown. Använd # för rubriker, ## för underrubriker. Separera stycken med dubbla radbrytningar.",
    word: "Skriv i markdown. Använd # för rubriker. Separera stycken med dubbla radbrytningar.",
    excel: `Svara ENBART med JSON (inga code-fences, inget annat). Formatet ska vara:
[{"name":"Bladnamn","headers":["Kolumn1","Kolumn2"],"rows":[["rad1kol1","rad1kol2"],["rad2kol1",123]]}]
Varje objekt representerar ett ark. rows-värden kan vara strängar eller nummer.`,
  };

  const systemPrompt = `Du är expert på att skapa professionella dokument för byggbranschen.
Skriv på svenska. ${formatGuide[contentType]}
${template ? `Dokumentmall: ${template}` : ""}
Var koncis, professionell och korrekt.`;

  const userPrompt = `Skapa innehåll för ${template ?? "dokument"}: "${title}"
${projectData ? `\nProjektdata:\n${JSON.stringify(projectData, null, 2)}` : ""}
\nInstruktioner: ${instructions}`;

  try {
    const result = await generateText({
      model: anthropic("claude-opus-4-6"),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 4096,
      timeout: 120_000, // 120 seconds — prevents hanging on document generation
    });
    return result.text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.error("Opus sub-agent timed out after 60 seconds", { contentType, title });
    } else {
      logger.error("Opus sub-agent failed", {
        error: err instanceof Error ? err.message : String(err),
        contentType,
        title,
      });
    }
    return null;
  }
}

/**
 * Parsar Opus-genererat Excel-JSON till sheets-array.
 * Returnerar null om parsningen misslyckas.
 */
function parseOpusExcelContent(
  text: string
): Array<{ name: string; headers: string[]; rows: (string | number)[][] }> | null {
  try {
    // Strip potential code fences
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((sheet: Record<string, unknown>) => ({
      name: String(sheet.name ?? "Blad1"),
      headers: Array.isArray(sheet.headers) ? sheet.headers.map(String) : [],
      rows: Array.isArray(sheet.rows)
        ? sheet.rows.map((row: unknown[]) =>
            Array.isArray(row) ? row.map((v) => (typeof v === "number" ? v : String(v ?? ""))) : []
          )
        : [],
    }));
  } catch {
    return null;
  }
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
  instructions?: string;
};

/**
 * Genererar ett Excel-dokument (.xlsx) och sparar det i projektets fillista.
 * Supports multi-sheet via `sheets` param or legacy single-sheet via `sheetName`+`rows`.
 */
export async function generateExcelDocument(params: GenerateExcelParams) {
  const { db, tenantId, projectId, userId, fileName, title, template, instructions } = params;

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return { error: "fileName måste sluta med .xlsx" };
  }

  const workbook = new ExcelJS.Workbook();

  // Use Opus to generate sheets when instructions are provided and no sheets given
  let opusSheets: ExcelSheet[] | null = null;
  if (instructions && (!params.sheets || params.sheets.length === 0)) {
    const opusContent = await generateContentWithOpus({
      title: title ?? fileName,
      instructions,
      template: template ?? null,
      contentType: "excel",
    });
    if (opusContent) {
      opusSheets = parseOpusExcelContent(opusContent);
    }
    // If Opus failed and no fallback data provided, return error
    if (!opusContent && (!params.rows || params.rows.length === 0)) {
      return { error: "Kunde inte generera Excel-innehåll. AI-tjänsten svarade inte i tid. Försök igen." };
    }
  }

  // Determine sheets: Opus-generated, explicit sheets, or legacy single-sheet
  const sheetDefs: ExcelSheet[] = opusSheets && opusSheets.length > 0
    ? opusSheets
    : params.sheets && params.sheets.length > 0
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
  instructions?: string;
};

/**
 * Genererar ett PDF-dokument och sparar det i projektets fillista.
 */
export async function generatePdfDocument(params: GeneratePdfParams) {
  const { db, tenantId, projectId, userId, fileName, title, template, instructions } = params;
  let { content } = params;

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return { error: "fileName måste sluta med .pdf" };
  }

  // Use Opus to generate content when instructions are provided
  if (instructions) {
    const opusContent = await generateContentWithOpus({
      title,
      instructions,
      template: template ?? null,
      contentType: "pdf",
    });
    if (opusContent) {
      content = opusContent;
    } else if (!content) {
      // Return error instead of creating PDF with error message
      return { error: "Kunde inte generera innehåll. AI-tjänsten svarade inte i tid. Försök igen." };
    }
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
  instructions?: string;
};

/**
 * Genererar ett Word-dokument (.docx) och sparar det i projektets fillista.
 */
export async function generateWordDocument(params: GenerateWordParams) {
  const { db, tenantId, projectId, userId, fileName, title, paragraphs, template, instructions } = params;
  let { content } = params;

  if (!fileName.toLowerCase().endsWith(".docx")) {
    return { error: "fileName måste sluta med .docx" };
  }

  // Use Opus to generate content when instructions are provided
  if (instructions) {
    const opusContent = await generateContentWithOpus({
      title,
      instructions,
      template: template ?? null,
      contentType: "word",
    });
    if (opusContent) {
      content = opusContent;
    } else if (!content && (!paragraphs || paragraphs.length === 0)) {
      // Return error instead of creating document with error message
      return { error: "Kunde inte generera innehåll. AI-tjänsten svarade inte i tid. Försök igen." };
    }
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
      "Generera en Excel-fil (.xlsx) och spara i projektets fillista. Ange filnamn, valfri titel och ett eller flera blad (sheets). Varje blad har namn, rubrikrad (headers) och datarader (rows). Valfritt: template 'materiallista' för formaterad tabell med fet rubrikrad, anpassade kolumnbredder och summeringsrad. TIP: Om du anger instructions istället för sheets kommer en avancerad AI (Opus) att generera data baserat på instruktionerna.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn t.ex. materiallista.xlsx"),
      title: z.string().optional().describe("Dokumenttitel"),
      sheets: z.array(z.object({
        name: z.string().describe("Bladnamn"),
        headers: z.array(z.string()).describe("Rubrikrad"),
        rows: z.array(z.array(z.union([z.string(), z.number()]))).describe("Datarader"),
      })).optional().describe("Blad med data (valfritt om instructions anges)"),
      template: z.enum(["materiallista"]).optional().nullable()
        .describe("Layout-mall: materiallista (formaterad tabell) eller null för standard"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att generera data, t.ex. 'Skapa en materiallista för badrumsrenovering'"),
    })),
    execute: async ({ fileName, title, sheets, template, instructions }) => {
      return generateExcelDocument({
        db, tenantId, projectId, userId, fileName, title,
        sheets, template: template ?? null, instructions,
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
      "Generera en PDF-fil och spara i projektets fillista. Ange filnamn (.pdf), titel och innehåll (markdown eller text; stycken separeras med dubbla radbrytningar, rubriker med #). Valfritt: template för layout – projektrapport (header, sektioner, footer), offert (villkor i footer), protokoll (deltagarlista-format), eller null för fritt format. TIP: Om du anger instructions istället för content kommer en avancerad AI (Opus) att generera professionellt innehåll.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn t.ex. rapport.pdf"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().optional().describe("Brödtext i markdown eller vanlig text (valfritt om instructions anges)"),
      template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
        .describe("Layout-mall eller null för fritt format"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att generera innehållet, t.ex. 'Skapa en offert för elinstallation'"),
    })),
    execute: async ({ fileName, title, content, template, instructions }) => {
      return generatePdfDocument({
        db, tenantId, projectId, userId, fileName, title, content: content ?? "",
        template: template ?? null, instructions,
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
      "Generera ett Word-dokument (.docx) och spara i projektets fillista. Ange filnamn (.docx), titel och innehåll (markdown eller text; stycken separeras med dubbla radbrytningar). Valfritt: template för layout – projektrapport, offert, protokoll, eller null för fritt format. TIP: Om du anger instructions istället för content kommer en avancerad AI (Opus) att generera professionellt innehåll.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn t.ex. offert.docx"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().optional().describe("Brödtext, stycken separeras med dubbla radbrytningar (valfritt om instructions anges)"),
      template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
        .describe("Layout-mall eller null för fritt format"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att generera innehållet, t.ex. 'Skriv ett mötesprotokoll'"),
    })),
    execute: async ({ fileName, title, content, template, instructions }) => {
      return generateWordDocument({
        db, tenantId, projectId, userId, fileName, title, content,
        template: template ?? null, instructions,
      });
    },
  });
}

/**
 * Skapar ett readExcelFile-verktyg.
 */
export function createReadExcelFileTool(ctx: SharedToolsContext) {
  const { db, tenantId } = ctx;
  return tool({
    description:
      "Läs innehållet från en Excel-fil i projektet. Returnerar alla ark med rubrikrader och datarader. Använd för att läsa mallfiler eller befintliga Excel-dokument.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("Filens ID från fillistan"),
    })),
    execute: async ({ fileId }) => {
      return readExcelFileContent({ db, tenantId, fileId });
    },
  });
}

/**
 * Skapar ett editExcelFile-verktyg.
 */
export function createEditExcelFileTool(ctx: SharedToolsContext) {
  const { db, tenantId, projectId, userId } = ctx;
  return tool({
    description:
      "Redigera en Excel-fil och spara som ny fil. Ange källfilens ID, nytt filnamn och en lista med ändringar. Varje ändring anger ark (valfritt, default första arket), cell (t.ex. 'A1', 'B5') och värde. Användbart för att fylla i mallar med projektdata. TIP: Om du anger instructions istället för edits kommer en avancerad AI (Opus) att bestämma vilka ändringar som ska göras.",
    inputSchema: toolInputSchema(z.object({
      sourceFileId: z.string().describe("ID för original-filen (mallen)"),
      newFileName: z.string().describe("Namn på den nya filen (måste sluta med .xlsx)"),
      edits: z.array(z.object({
        sheet: z.string().optional().describe("Arknamn (valfritt, använder första arket om ej angivet)"),
        cell: z.string().describe("Cellreferens, t.ex. 'A1', 'B5', 'C10'"),
        value: z.union([z.string(), z.number()]).describe("Nytt värde för cellen"),
      })).optional().default([]).describe("Lista med ändringar att applicera (valfritt om instructions anges)"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att bestämma ändringar, t.ex. 'Fyll i projektdata'"),
    })),
    execute: async ({ sourceFileId, newFileName, edits, instructions }) => {
      return editExcelFileContent({
        db, tenantId, userId, projectId, sourceFileId, newFileName, edits: edits ?? [], instructions,
      });
    },
  });
}

/**
 * Skapar ett readWordFile-verktyg.
 */
export function createReadWordFileTool(ctx: SharedToolsContext) {
  const { db, tenantId } = ctx;
  return tool({
    description:
      "Läs textinnehållet från en Word-fil (.docx eller .doc) i projektet. Returnerar textinnehållet som sträng. Användbart för att läsa mallar eller befintliga Word-dokument.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("Filens ID från fillistan"),
    })),
    execute: async ({ fileId }) => {
      return readWordFileContent({ db, tenantId, fileId });
    },
  });
}

// ============================================================================
// Läsa och redigera befintliga filer (Excel, Word)
// ============================================================================

type ReadExcelParams = {
  db: TenantScopedClient;
  tenantId: string;
  fileId: string;
};

/**
 * Läser innehållet från en Excel-fil. Returnerar alla ark med headers och rader.
 */
export async function readExcelFileContent(params: ReadExcelParams) {
  const { db, fileId } = params;

  // Fetch file record from DB (tenantDb already scopes by tenant)
  const file = await db.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { error: "Filen hittades inte." };
  }

  if (!file.key || !file.bucket) {
    return { error: "Filen har ingen lagringsreferens." };
  }

  // Verify file is Excel
  const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.name.toLowerCase().endsWith(".xls");

  if (!isExcel) {
    return { error: "Filen är inte en Excel-fil (.xlsx eller .xls)." };
  }

  try {
    // Fetch file from MinIO
    const buffer = await fetchFileFromMinIO(file.bucket, file.key);

    // Parse with ExcelJS (cast for Buffer type compatibility with ExcelJS typings)
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error ExcelJS Buffer type mismatch with Node 22 generic Buffer
    await workbook.xlsx.load(buffer);

    // Extract sheets
    const sheets: Array<{
      name: string;
      headers: string[];
      rows: (string | number | null)[][];
    }> = [];

    workbook.eachSheet((worksheet) => {
      const sheetName = worksheet.name;
      const headers: string[] = [];
      const rows: (string | number | null)[][] = [];

      let isFirstRow = true;

      worksheet.eachRow((row, rowNumber) => {
        const rowValues = row.values as unknown[];
        // ExcelJS row.values has a weird structure: [empty, val1, val2, ...]
        const cleanValues = Array.isArray(rowValues) ? rowValues.slice(1) : [];

        const cellValues = cleanValues.map((cell) => {
          if (cell === null || cell === undefined) return null;
          if (typeof cell === "object" && "text" in cell) return String((cell as { text?: unknown }).text);
          if (typeof cell === "object" && "result" in cell) return (cell as { result?: unknown }).result as string | number | null;
          return cell as string | number | null;
        });

        if (isFirstRow) {
          headers.push(...cellValues.map(v => v != null ? String(v) : ""));
          isFirstRow = false;
        } else {
          rows.push(cellValues);
        }
      });

      sheets.push({ name: sheetName, headers, rows });
    });

    return {
      fileId: file.id,
      fileName: file.name,
      sheets,
    };
  } catch (error) {
    return { error: `Kunde inte läsa Excel-filen: ${error instanceof Error ? error.message : "Okänt fel"}` };
  }
}

type EditExcelParams = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
  projectId: string;
  sourceFileId: string;
  newFileName: string;
  edits: Array<{
    sheet?: string;
    cell: string;
    value: string | number;
  }>;
  instructions?: string;
};

/**
 * Redigerar en Excel-fil och sparar som ny fil.
 */
export async function editExcelFileContent(params: EditExcelParams) {
  const { db, tenantId, userId, projectId, sourceFileId, newFileName, instructions } = params;
  let { edits } = params;

  if (!newFileName.toLowerCase().endsWith(".xlsx")) {
    return { error: "newFileName måste sluta med .xlsx" };
  }

  // Use Opus to generate edits when instructions are provided but no explicit edits
  if (instructions && edits.length === 0) {
    const opusContent = await generateContentWithOpus({
      title: newFileName,
      instructions,
      contentType: "excel",
    });
    if (opusContent) {
      // Try to parse as cell edits: [{"cell":"A1","value":"test","sheet":"Blad1"}]
      try {
        const cleaned = opusContent.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          edits = parsed.map((e: Record<string, unknown>) => ({
            sheet: e.sheet ? String(e.sheet) : undefined,
            cell: String(e.cell ?? "A1"),
            value: typeof e.value === "number" ? e.value : String(e.value ?? ""),
          }));
        }
      } catch {
        // Opus couldn't produce valid edits JSON — fall through with empty edits
      }
    }
    // If Opus failed or produced no valid edits, return error
    if (!opusContent || edits.length === 0) {
      return { error: "Kunde inte generera redigeringar. AI-tjänsten svarade inte i tid eller kunde inte tolka instruktionerna. Försök igen." };
    }
  }

  // Fetch original file (tenantDb already scopes by tenant)
  const sourceFile = await db.file.findUnique({
    where: { id: sourceFileId },
  });

  if (!sourceFile) {
    return { error: "Källfilen hittades inte." };
  }

  if (!sourceFile.key || !sourceFile.bucket) {
    return { error: "Källfilen har ingen lagringsreferens." };
  }

  try {
    // Fetch file from MinIO
    const buffer = await fetchFileFromMinIO(sourceFile.bucket, sourceFile.key);

    // Parse with ExcelJS (cast for Buffer type compatibility with ExcelJS typings)
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error ExcelJS Buffer type mismatch with Node 22 generic Buffer
    await workbook.xlsx.load(buffer);

    // Apply edits
    for (const edit of edits) {
      const sheetName = edit.sheet ?? workbook.worksheets[0]?.name;
      if (!sheetName) {
        return { error: "Inget ark hittades i arbetsboken." };
      }

      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) {
        return { error: `Ark "${sheetName}" hittades inte.` };
      }

      const cell = worksheet.getCell(edit.cell);
      cell.value = edit.value;
    }

    // Write to buffer
    const outputBuffer = await workbook.xlsx.writeBuffer();

    // Extract text content for OCR
    const textParts: string[] = [];
    for (const ws of workbook.worksheets) {
      textParts.push(`\n--- ${ws.name} ---`);
      ws.eachRow((row) => {
        const rowValues = row.values as unknown[];
        const cleanValues = Array.isArray(rowValues) ? rowValues.slice(1) : [];
        textParts.push(cleanValues.join(' | '));
      });
    }
    const textContent = textParts.join('\n');

    // Save as new file (new version linked to source)
    const saved = await saveGeneratedDocumentToProject({
      db,
      tenantId,
      projectId,
      userId,
      fileName: newFileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: new Uint8Array(outputBuffer),
      content: textContent,
      parentFileId: sourceFileId,
    });

    if ("error" in saved) {
      return { error: saved.error };
    }

    // Create presigned download URL
    const downloadUrl = await createPresignedDownloadUrl({
      bucket: saved.bucket,
      key: saved.key,
      expiresInSeconds: 60 * 30,
    });

    return {
      __fileCreated: true as const,
      fileId: saved.fileId,
      fileName: saved.name,
      fileType: "excel" as const,
      fileSize: saved.size,
      downloadUrl,
      message: `Excel-fil "${newFileName}" skapad från mall "${sourceFile.name}"`,
    };
  } catch (error) {
    return { error: `Kunde inte redigera Excel-filen: ${error instanceof Error ? error.message : "Okänt fel"}` };
  }
}

type ReadWordParams = {
  db: TenantScopedClient;
  tenantId: string;
  fileId: string;
};

/**
 * Läser innehållet från en Word-fil. Returnerar text och HTML.
 */
export async function readWordFileContent(params: ReadWordParams) {
  const { db, fileId } = params;

  // Fetch file record from DB (tenantDb already scopes by tenant)
  const file = await db.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { error: "Filen hittades inte." };
  }

  if (!file.key || !file.bucket) {
    return { error: "Filen har ingen lagringsreferens." };
  }

  // Verify file is Word
  const isWord = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword" ||
    file.name.toLowerCase().endsWith(".docx") ||
    file.name.toLowerCase().endsWith(".doc");

  if (!isWord) {
    return { error: "Filen är inte en Word-fil (.docx eller .doc)." };
  }

  try {
    // Fetch file from MinIO
    const buffer = await fetchFileFromMinIO(file.bucket, file.key);

    const result = await mammoth.extractRawText({ buffer });

    return {
      fileId: file.id,
      fileName: file.name,
      text: result.value,
      messages: result.messages.map(m => m.message),
    };
  } catch (error) {
    return { error: `Kunde inte läsa Word-filen: ${error instanceof Error ? error.message : "Okänt fel"}` };
  }
}

// ============================================================================
// Docxtemplater – analysera och fylla i dokumentmallar (.docx/.pptx)
// ============================================================================

type AnalyzeTemplateParams = {
  db: TenantScopedClient;
  tenantId: string;
  fileId: string;
};

export type TemplateAnalysis = {
  fileId: string;
  fileName: string;
  variables: string[];
  loops: Array<{ name: string; variables: string[] }>;
};

/**
 * Analysera en docx/pptx-mall och extrahera alla platshållare ({variabel}, {#loop}...{/loop}).
 * Använder docxtemplater InspectModule för att hitta alla tags.
 */
export async function analyzeDocxTemplate(params: AnalyzeTemplateParams): Promise<TemplateAnalysis | { error: string }> {
  const { db, fileId } = params;

  const file = await db.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { error: "Filen hittades inte." };
  }

  if (!file.key || !file.bucket) {
    return { error: "Filen har ingen lagringsreferens." };
  }

  // Verify file is docx or pptx
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx");
  const isPptx = file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.name.toLowerCase().endsWith(".pptx");

  if (!isDocx && !isPptx) {
    return { error: "Filen måste vara en .docx eller .pptx-fil för mallanalys." };
  }

  try {
    const buffer = await fetchFileFromMinIO(file.bucket, file.key);
    const zip = new PizZip(buffer);
    const iModule = new InspectModule();
    const doc = new Docxtemplater(zip, {
      modules: [iModule],
      paragraphLoop: true,
      linebreaks: true,
    });

    // getAllTags returns a nested object: { var1: {}, loop1: { innerVar: {} } }
    const tags = iModule.getAllTags();

    const variables: string[] = [];
    const loops: Array<{ name: string; variables: string[] }> = [];

    function extractTags(obj: Record<string, unknown>, prefix = "") {
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0) {
          // This is a loop/section — it has nested variables
          const innerVars: string[] = [];
          const inner = value as Record<string, unknown>;
          for (const [innerKey, innerValue] of Object.entries(inner)) {
            if (innerValue && typeof innerValue === "object" && Object.keys(innerValue as Record<string, unknown>).length > 0) {
              // Nested loop inside loop — treat as variable for simplicity
              innerVars.push(innerKey);
            } else {
              innerVars.push(innerKey);
            }
          }
          loops.push({ name: prefix ? `${prefix}.${key}` : key, variables: innerVars });
        } else {
          variables.push(prefix ? `${prefix}.${key}` : key);
        }
      }
    }

    extractTags(tags);

    return {
      fileId: file.id,
      fileName: file.name,
      variables,
      loops,
    };
  } catch (error) {
    return { error: `Kunde inte analysera mallen: ${error instanceof Error ? error.message : "Okänt fel"}` };
  }
}

type FillTemplateParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  sourceFileId: string;
  data: Record<string, unknown>;
  newFileName: string;
};

/**
 * Fyller i en docx/pptx-mall med data och sparar som ny fil i projektet.
 * Använder docxtemplater för att ersätta platshållare med verkliga värden.
 */
export async function fillDocxTemplate(params: FillTemplateParams) {
  const { db, tenantId, projectId, userId, sourceFileId, data, newFileName } = params;

  // Verify file extension matches source type
  const sourceFile = await db.file.findUnique({
    where: { id: sourceFileId },
  });

  if (!sourceFile) {
    return { error: "Källfilen (mallen) hittades inte." };
  }

  if (!sourceFile.key || !sourceFile.bucket) {
    return { error: "Källfilen har ingen lagringsreferens." };
  }

  const isDocx = sourceFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    sourceFile.name.toLowerCase().endsWith(".docx");
  const isPptx = sourceFile.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    sourceFile.name.toLowerCase().endsWith(".pptx");

  if (!isDocx && !isPptx) {
    return { error: "Källfilen måste vara en .docx eller .pptx-fil." };
  }

  // Validate newFileName extension matches source
  const expectedExt = isDocx ? ".docx" : ".pptx";
  if (!newFileName.toLowerCase().endsWith(expectedExt)) {
    return { error: `Filnamnet måste sluta med ${expectedExt} (samma format som mallen).` };
  }

  try {
    const buffer = await fetchFileFromMinIO(sourceFile.bucket, sourceFile.key);
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Return empty string for missing variables instead of throwing
      nullGetter() {
        return "";
      },
    });

    doc.render(data);

    const outputBuffer = doc.toBuffer();

    // Extract text content for OCR/search
    const textParts: string[] = [];
    try {
      const fullText = doc.getFullText();
      if (fullText) textParts.push(fullText);
    } catch {
      // getFullText might fail for pptx, that's ok
    }

    // Also add the data values as searchable text
    function flattenData(obj: Record<string, unknown>, prefix = ""): string[] {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === "object" && item !== null) {
              parts.push(...flattenData(item as Record<string, unknown>, `${prefix}${key}.`));
            } else {
              parts.push(String(item));
            }
          }
        } else if (typeof value === "object" && value !== null) {
          parts.push(...flattenData(value as Record<string, unknown>, `${prefix}${key}.`));
        } else if (value !== null && value !== undefined) {
          parts.push(String(value));
        }
      }
      return parts;
    }
    textParts.push(...flattenData(data));

    const textContent = textParts.join("\n");

    const contentType = isDocx
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    const saved = await saveGeneratedDocumentToProject({
      db,
      tenantId,
      projectId,
      userId,
      fileName: newFileName,
      contentType,
      buffer: new Uint8Array(outputBuffer),
      content: textContent,
      parentFileId: sourceFileId,
    });

    if ("error" in saved) {
      return { error: saved.error };
    }

    const downloadUrl = await createPresignedDownloadUrl({
      bucket: saved.bucket,
      key: saved.key,
      expiresInSeconds: 60 * 30,
    });

    return {
      __fileCreated: true as const,
      fileId: saved.fileId,
      fileName: saved.name,
      fileType: (isDocx ? "word" : "powerpoint") as "word" | "powerpoint",
      fileSize: saved.size,
      downloadUrl,
      message: `Dokument "${newFileName}" skapat från mall "${sourceFile.name}"`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Okänt fel";
    return { error: `Kunde inte fylla i mallen: ${msg}` };
  }
}

/**
 * Skapar ett analyzeDocumentTemplate-verktyg.
 */
export function createAnalyzeDocumentTemplateTool(ctx: SharedToolsContext) {
  const { db, tenantId } = ctx;
  return tool({
    description:
      "Analysera en dokumentmall (.docx eller .pptx) och extrahera alla platshållare. Mallen använder {variabel}-syntax för enkla variabler och {#loop}...{/loop} för upprepade sektioner. Returnerar en lista med variabler och loopar som behöver fyllas i. Använd detta INNAN fillDocumentTemplate för att förstå vilka data mallen behöver.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("Filens ID från fillistan"),
    })),
    execute: async ({ fileId }) => {
      return analyzeDocxTemplate({ db, tenantId, fileId });
    },
  });
}

/**
 * Skapar ett fillDocumentTemplate-verktyg.
 */
export function createFillDocumentTemplateTool(ctx: SharedToolsContext) {
  const { db, tenantId, projectId, userId } = ctx;
  return tool({
    description:
      "Fyll i en dokumentmall (.docx eller .pptx) med data och spara som ny fil. Mallen innehåller platshållare som {kundnamn}, {projektadress} och loopar som {#rader}{beskrivning} - {pris}{/rader}. Analysera mallen med analyzeDocumentTemplate först för att se vilka variabler som behövs. Data skickas som JSON-objekt där nycklar matchar variabelnamnen. Loopar skickas som arrayer av objekt.",
    inputSchema: toolInputSchema(z.object({
      sourceFileId: z.string().describe("ID för mallfilen"),
      newFileName: z.string().describe("Namn på den nya filen (samma filändelse som mallen)"),
      data: z.record(z.string(), z.unknown()).describe("JSON-objekt med data att fylla i. Nycklar matchar mallens platshållare. Loopar = arrayer av objekt, t.ex. { kundnamn: 'AB Bygg', rader: [{ beskrivning: 'Kabel', pris: 500 }] }"),
    })),
    execute: async ({ sourceFileId, newFileName, data }) => {
      return fillDocxTemplate({
        db, tenantId, projectId, userId, sourceFileId, data, newFileName,
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
