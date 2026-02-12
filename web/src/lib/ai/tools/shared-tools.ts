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
import { buildSimplePdf } from "@/lib/reports/simple-content-pdf";
import { buildSimpleDocx } from "@/lib/reports/simple-content-docx";
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
  const results = await searchDocuments(tenantId, projectId, query, { limit, threshold: 0.5 });
  return results.map((r) => ({
    fileName: r.fileName,
    page: r.page,
    similarity: r.similarity,
    excerpt: r.content.slice(0, 300) + (r.content.length > 300 ? "…" : ""),
  }));
}

type SearchDocumentsGlobalParams = {
  tenantId: string;
  projectIds: string[];
  query: string;
  limit: number;
};

/**
 * Söker i dokument över flera projekt (används av personlig AI).
 */
export async function searchDocumentsAcrossProjects(params: SearchDocumentsGlobalParams) {
  const { tenantId, projectIds, query, limit } = params;
  if (projectIds.length === 0) return [];
  const results = await searchDocumentsGlobal(tenantId, projectIds, query, {
    limit,
    threshold: 0.5,
  });
  return results.map((r) => ({
    projectName: r.projectName,
    projectId: r.projectId,
    fileName: r.fileName,
    page: r.page,
    similarity: r.similarity,
    excerpt: r.content.slice(0, 250) + (r.content.length > 250 ? "…" : ""),
  }));
}

// ============================================================================
// Dokumentgenerering (Excel, PDF, Word)
// ============================================================================

type GenerateExcelParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  sheetName?: string;
  rows: string[][];
};

/**
 * Genererar ett Excel-dokument (.xlsx) och sparar det i projektets fillista.
 */
export async function generateExcelDocument(params: GenerateExcelParams) {
  const { db, tenantId, projectId, userId, fileName, sheetName, rows } = params;

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return { error: "fileName måste sluta med .xlsx" };
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName ?? "Blad1", {});
  for (const row of rows) {
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const saved = await saveGeneratedDocumentToProject({
    db,
    tenantId,
    projectId,
    userId,
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: new Uint8Array(buffer),
  });

  if ("error" in saved) {
    return { error: saved.error };
  }

  return { fileId: saved.fileId, name: saved.name, message: "Excel-fil sparad i projektets fillista." };
}

type GeneratePdfParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  title: string;
  content: string;
};

/**
 * Genererar ett PDF-dokument och sparar det i projektets fillista.
 */
export async function generatePdfDocument(params: GeneratePdfParams) {
  const { db, tenantId, projectId, userId, fileName, title, content } = params;

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return { error: "fileName måste sluta med .pdf" };
  }

  const buffer = await buildSimplePdf(title, content);
  const saved = await saveGeneratedDocumentToProject({
    db,
    tenantId,
    projectId,
    userId,
    fileName,
    contentType: "application/pdf",
    buffer,
  });

  if ("error" in saved) {
    return { error: saved.error };
  }

  return { fileId: saved.fileId, name: saved.name, message: "PDF sparad i projektets fillista." };
}

type GenerateWordParams = {
  db: TenantScopedClient;
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  title: string;
  paragraphs: string[];
};

/**
 * Genererar ett Word-dokument (.docx) och sparar det i projektets fillista.
 */
export async function generateWordDocument(params: GenerateWordParams) {
  const { db, tenantId, projectId, userId, fileName, title, paragraphs } = params;

  if (!fileName.toLowerCase().endsWith(".docx")) {
    return { error: "fileName måste sluta med .docx" };
  }

  const buffer = await buildSimpleDocx(title, paragraphs);
  const saved = await saveGeneratedDocumentToProject({
    db,
    tenantId,
    projectId,
    userId,
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });

  if ("error" in saved) {
    return { error: saved.error };
  }

  return { fileId: saved.fileId, name: saved.name, message: "Word-dokument sparat i projektets fillista." };
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
      "Generera ett Excel-dokument (.xlsx) och spara det i projektets fillista. Ange filnamn (t.ex. materiallista.xlsx) och rader som en lista av listor: varje rad är en lista av cellvärden (strängar). Det sparade dokumentet syns i projektets filflik.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn med .xlsx, t.ex. materiallista.xlsx"),
      sheetName: z.string().optional().describe("Namn på arbetsbladet"),
      rows: z
        .array(z.array(z.string()))
        .describe("Rader: varje rad är en array av cellvärden (strängar)"),
    })),
    execute: async ({ fileName, sheetName, rows }) => {
      return generateExcelDocument({ db, tenantId, projectId, userId, fileName, sheetName, rows });
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
      "Generera ett PDF-dokument och spara det i projektets fillista. Ange filnamn (t.ex. rapport.pdf), titel och innehåll (brödtext). Innehållet kan ha stycken separerade med dubbla radbrytningar. Det sparade dokumentet syns i projektets filflik.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn med .pdf, t.ex. rapport.pdf"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().describe("Brödtext; stycken separeras med dubbla radbrytningar"),
    })),
    execute: async ({ fileName, title, content }) => {
      return generatePdfDocument({ db, tenantId, projectId, userId, fileName, title, content });
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
      "Generera ett Word-dokument (.docx) och spara det i projektets fillista. Ange filnamn (t.ex. offert.docx), titel och stycken (lista av strängar). Det sparade dokumentet syns i projektets filflik.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn med .docx, t.ex. offert.docx"),
      title: z.string().describe("Dokumentets titel"),
      paragraphs: z.array(z.string()).describe("Lista av stycken (strängar)"),
    })),
    execute: async ({ fileName, title, paragraphs }) => {
      return generateWordDocument({ db, tenantId, projectId, userId, fileName, title, paragraphs });
    },
  });
}
