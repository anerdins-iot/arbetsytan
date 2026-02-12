/**
 * Project AI tools. All use tenantDb(tenantId) and require project access
 * (caller must have validated via requireProject before invoking).
 */
import { tool } from "ai";
import { z } from "zod";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import ExcelJS from "exceljs";
import { searchDocuments } from "@/lib/ai/embeddings";
import { getOcrTextForFile } from "@/lib/ai/ocr";
import { saveGeneratedDocumentToProject } from "@/lib/ai/save-generated-document";
import { buildSimplePdf } from "@/lib/reports/simple-content-pdf";
import { buildSimpleDocx } from "@/lib/reports/simple-content-docx";
import { sendProjectToPersonalAIMessage } from "@/lib/ai/aimessage-triggers";
import type { TenantScopedClient } from "@/lib/db";

export type ProjectToolsContext = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
  projectId: string;
};

export function createProjectTools(ctx: ProjectToolsContext) {
  const { db, tenantId, userId, projectId } = ctx;

  const getProjectTasks = tool({
    description:
      "Hämta alla uppgifter i projektet. Returnerar titel, status, prioritet, deadline och tilldelade personer.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal uppgifter"),
    })),
    execute: async ({ limit = 50 }) => {
      const tasks = await db.task.findMany({
        where: { projectId },
        include: {
          assignments: {
            include: {
              membership: {
                include: { user: { select: { id: true, name: true, email: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline?.toISOString() ?? null,
        assignees: t.assignments.map((a) => ({
          name: a.membership.user.name ?? a.membership.user.email,
          email: a.membership.user.email,
        })),
      }));
    },
  });

  const createTask = tool({
    description:
      "Skapa en ny uppgift i projektet. Ange titel, valfritt beskrivning, prioritet (LOW, MEDIUM, HIGH, URGENT) och valfritt deadline (ISO-datum). Om du tilldelar uppgiften till någon, ange assigneeMembershipId (membershipId från getProjectMembers) — då skickas ett meddelande till deras personliga AI.",
    inputSchema: toolInputSchema(z.object({
      title: z.string().describe("Uppgiftens titel"),
      description: z.string().optional().describe("Beskrivning av uppgiften"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      deadline: z.string().optional().describe("Deadline i ISO-format (YYYY-MM-DD)"),
      assigneeMembershipId: z.string().optional().describe("MembershipId för den som ska tilldelas uppgiften (från getProjectMembers); skickar då notis till deras personliga AI"),
    })),
    execute: async ({ title, description, priority, deadline, assigneeMembershipId }) => {
      const task = await db.task.create({
        data: {
          title,
          description: description ?? null,
          priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          status: "TODO",
          deadline: deadline ? new Date(deadline) : null,
          projectId,
        },
      });

      if (assigneeMembershipId) {
        const membership = await db.membership.findFirst({
          where: { id: assigneeMembershipId, tenantId },
          include: { user: { select: { id: true } } },
        });
        if (membership) {
          const existing = await db.taskAssignment.findFirst({
            where: { taskId: task.id, membershipId: assigneeMembershipId },
          });
          if (!existing) {
            await db.taskAssignment.create({
              data: {
                taskId: task.id,
                membershipId: assigneeMembershipId,
              },
            });
            const project = await db.project.findUnique({
              where: { id: projectId },
              select: { name: true },
            });
            const projectName = project?.name ?? "projektet";
            await sendProjectToPersonalAIMessage({
              db,
              projectId,
              userId: membership.user.id,
              type: "task_assigned",
              content: `Du har tilldelats uppgiften "${task.title}" i projektet ${projectName}.`,
            });
          }
        }
      }

      return { id: task.id, title: task.title, status: task.status, message: "Uppgift skapad." };
    },
  });

  const updateTask = tool({
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
      const existing = await db.task.findFirst({
        where: { id: taskId, projectId },
      });
      if (!existing) return { error: "Uppgiften hittades inte i detta projekt." };
      const task = await db.task.update({
        where: { id: taskId },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status: status as "TODO" | "IN_PROGRESS" | "DONE" }),
          ...(priority !== undefined && { priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT" }),
          ...(deadline !== undefined && {
            deadline: deadline === null || deadline === "" ? null : new Date(deadline),
          }),
        },
      });
      return { id: task.id, title: task.title, status: task.status, message: "Uppgift uppdaterad." };
    },
  });

  const assignTask = tool({
    description:
      "Tilldela en befintlig uppgift till en projektmedlem. Ange taskId och membershipId (från getProjectMembers). Skickar automatiskt ett meddelande till medlemmens personliga AI.",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("Uppgiftens ID"),
      membershipId: z.string().describe("MembershipId för den som ska tilldelas (från getProjectMembers)"),
    })),
    execute: async ({ taskId, membershipId }) => {
      const task = await db.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true, title: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

      const membership = await db.membership.findFirst({
        where: { id: membershipId, tenantId },
        include: { user: { select: { id: true } } },
      });
      if (!membership) return { error: "Medlemmen hittades inte." };

      const existing = await db.taskAssignment.findFirst({
        where: { taskId, membershipId },
      });
      if (existing) return { error: "Uppgiften är redan tilldelad denna person." };

      await db.taskAssignment.create({
        data: { taskId, membershipId },
      });

      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const projectName = project?.name ?? "projektet";
      await sendProjectToPersonalAIMessage({
        db,
        projectId,
        userId: membership.user.id,
        type: "task_assigned",
        content: `Du har tilldelats uppgiften "${task.title}" i projektet ${projectName}.`,
      });

      return { id: task.id, message: "Uppgift tilldelad; användaren har fått ett meddelande i sin personliga AI." };
    },
  });

  const getProjectFiles = tool({
    description: "Hämta listan över filer i projektet (namn, typ, storlek, uppladdningsdatum).",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal filer"),
    })),
    execute: async ({ limit = 50 }) => {
      const files = await db.file.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, name: true, type: true, size: true, createdAt: true },
      });
      return files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
      }));
    },
  });

  const searchProjectDocuments = tool({
    description:
      "Söka i projektets dokument (PDF, ritningar) via semantisk sökning. Ange en fråga eller sökord; returnerar relevanta textutdrag från dokument.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökfråga eller nyckelord"),
      limit: z.number().min(1).max(20).optional().default(10),
    })),
    execute: async ({ query, limit }) => {
      const results = await searchDocuments(tenantId, projectId, query, { limit, threshold: 0.5 });
      return results.map((r) => ({
        fileName: r.fileName,
        page: r.page,
        similarity: r.similarity,
        excerpt: r.content.slice(0, 300) + (r.content.length > 300 ? "…" : ""),
      }));
    },
  });

  const getProjectMembers = tool({
    description: "Hämta projektets medlemmar med namn, e-post och roll.",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      const members = await db.projectMember.findMany({
        where: { projectId },
        include: {
          membership: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
      return members.map((m) => ({
        membershipId: m.membershipId,
        userName: m.membership.user.name ?? m.membership.user.email,
        email: m.membership.user.email,
      }));
    },
  });

  const sendAIMessageToPersonal = tool({
    description:
      "Skicka ett meddelande till en användares personliga AI (t.ex. för att notifiera om ny uppgift eller deadline). Ange användarens userId och meddelandets typ och innehåll. Använd parentId för att svara på ett tidigare meddelande (trådning).",
    inputSchema: toolInputSchema(z.object({
      targetUserId: z.string().describe("Användarens ID som ska få meddelandet"),
      type: z.string().describe("Typ av meddelande, t.ex. task_assigned, deadline_changed"),
      content: z.string().describe("Meddelandets innehåll på svenska"),
      parentId: z.string().optional().describe("ID på det AIMessage detta är svar på (trådning)"),
    })),
    execute: async ({ targetUserId, type, content, parentId }) => {
      await db.aIMessage.create({
        data: {
          direction: "PROJECT_TO_PERSONAL",
          type,
          content,
          userId: targetUserId,
          projectId,
          parentId: parentId ?? null,
        },
      });
      return { success: true, message: "Meddelande skickat till användarens personliga AI." };
    },
  });

  const getRepliesFromPersonalAI = tool({
    description:
      "Läs svar från användares personliga AI (PERSONAL_TO_PROJECT). Använd för att se om användare bekräftat uppgifter eller svarat på frågor.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(50).default(20).describe("Max antal meddelanden"),
    })),
    execute: async ({ limit }) => {
      const messages = await db.aIMessage.findMany({
        where: { projectId, direction: "PERSONAL_TO_PROJECT" },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      return messages.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        userName: m.user.name ?? m.user.email,
        userId: m.user.id,
        parentId: m.parentId,
        createdAt: m.createdAt.toISOString(),
      }));
    },
  });

  const analyzeDocument = tool({
    description:
      "Analysera en PDF eller ritning (bild) i projektet med OCR. Ange filens ID (fileId). Returnerar den extraherade texten som du kan använda som kontext för att svara på frågor om dokumentet. Använd getProjectFiles först om du behöver hitta rätt fileId.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("ID för filen som ska analyseras (t.ex. från getProjectFiles)"),
    })),
    execute: async ({ fileId }) => {
      const result = await getOcrTextForFile({ fileId, projectId, tenantId });
      if ("error" in result) {
        return { error: result.error };
      }
      return { fullText: result.fullText };
    },
  });

  const generateExcelDocument = tool({
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
    },
  });

  const generatePdfDocument = tool({
    description:
      "Generera ett PDF-dokument och spara det i projektets fillista. Ange filnamn (t.ex. rapport.pdf), titel och innehåll (brödtext). Innehållet kan ha stycken separerade med dubbla radbrytningar. Det sparade dokumentet syns i projektets filflik.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn med .pdf, t.ex. rapport.pdf"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().describe("Brödtext; stycken separeras med dubbla radbrytningar"),
    })),
    execute: async ({ fileName, title, content }) => {
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
    },
  });

  const generateWordDocument = tool({
    description:
      "Generera ett Word-dokument (.docx) och spara det i projektets fillista. Ange filnamn (t.ex. offert.docx), titel och stycken (lista av strängar). Det sparade dokumentet syns i projektets filflik.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().describe("Filnamn med .docx, t.ex. offert.docx"),
      title: z.string().describe("Dokumentets titel"),
      paragraphs: z.array(z.string()).describe("Lista av stycken (strängar)"),
    })),
    execute: async ({ fileName, title, paragraphs }) => {
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
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer,
      });
      if ("error" in saved) {
        return { error: saved.error };
      }
      return { fileId: saved.fileId, name: saved.name, message: "Word-dokument sparat i projektets fillista." };
    },
  });

  return {
    getProjectTasks,
    createTask,
    updateTask,
    assignTask,
    getProjectFiles,
    searchProjectDocuments,
    getProjectMembers,
    sendAIMessageToPersonal,
    getRepliesFromPersonalAI,
    analyzeDocument,
    generateExcelDocument,
    generatePdfDocument,
    generateWordDocument,
  };
}
