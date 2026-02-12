/**
 * Project AI tools. All use tenantDb(tenantId) and require project access
 * (caller must have validated via requireProject before invoking).
 */
import { tool, generateText } from "ai";
import { z } from "zod";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import { getOcrTextForFile } from "@/lib/ai/ocr";
import { sendProjectToPersonalAIMessage } from "@/lib/ai/aimessage-triggers";
import { openai } from "@ai-sdk/openai";
import { saveGeneratedDocumentToProject } from "@/lib/ai/save-generated-document";
import { buildSimplePdf } from "@/lib/reports/simple-content-pdf";
import type { TenantScopedClient } from "@/lib/db";
import {
  createTaskShared,
  updateTaskShared,
  createCreateTaskTool,
  createUpdateTaskTool,
  createSearchProjectDocumentsTool,
  createGenerateExcelDocumentTool,
  createGeneratePdfDocumentTool,
  createGenerateWordDocumentTool,
} from "@/lib/ai/tools/shared-tools";

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
      // Använd delad logik för att skapa uppgiften
      const result = await createTaskShared({
        db,
        projectId,
        title,
        description,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        deadline,
      });

      // Hantera tilldelning (projekt-AI-specifik logik)
      if (assigneeMembershipId && "id" in result) {
        const membership = await db.membership.findFirst({
          where: { id: assigneeMembershipId, tenantId },
          include: { user: { select: { id: true } } },
        });
        if (membership) {
          const existing = await db.taskAssignment.findFirst({
            where: { taskId: result.id, membershipId: assigneeMembershipId },
          });
          if (!existing) {
            await db.taskAssignment.create({
              data: {
                taskId: result.id,
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
              content: `Du har tilldelats uppgiften "${result.title}" i projektet ${projectName}.`,
            });
          }
        }
      }

      return result;
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
      // Använd delad logik för att uppdatera uppgiften
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

  const unassignTask = tool({
    description:
      "Ta bort tilldelning av uppgift från en projektmedlem. Ange taskId och membershipId (från getProjectMembers eller från uppgiftens assignees).",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("Uppgiftens ID"),
      membershipId: z.string().describe("MembershipId för den som ska ta bort tilldelningen för"),
    })),
    execute: async ({ taskId, membershipId }) => {
      // Verifiera att uppgiften finns i projektet
      const task = await db.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true, title: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

      // Verifiera att tilldelningen finns
      const assignment = await db.taskAssignment.findFirst({
        where: { taskId, membershipId },
      });
      if (!assignment) return { error: "Denna tilldelning finns inte." };

      // Ta bort tilldelningen
      await db.taskAssignment.delete({
        where: { id: assignment.id },
      });

      return {
        id: task.id,
        message: `Tilldelning för uppgiften "${task.title}" har tagits bort.`
      };
    },
  });

  const deleteTask = tool({
    description:
      "Ta bort en uppgift från projektet. VIKTIGT: Denna operation kan inte ångras. Använd endast när du är säker på att uppgiften ska tas bort permanent. Uppgiften och alla dess tilldelningar kommer att raderas.",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("ID för uppgiften som ska tas bort"),
      confirmDeletion: z.boolean().describe("Måste vara true för att bekräfta att uppgiften ska tas bort permanent"),
    })),
    execute: async ({ taskId, confirmDeletion }) => {
      if (!confirmDeletion) {
        return {
          error: "Radering avbröts: confirmDeletion måste vara true för att bekräfta att uppgiften ska tas bort permanent."
        };
      }

      // Verifiera att uppgiften finns i projektet
      const task = await db.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true, title: true, status: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

      // Ta bort alla tilldelningar först
      await db.taskAssignment.deleteMany({
        where: { taskId },
      });

      // Ta bort uppgiften
      await db.task.delete({
        where: { id: taskId },
      });

      return {
        success: true,
        deletedTaskId: taskId,
        message: `Uppgiften "${task.title}" har tagits bort permanent från projektet.`
      };
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

  // Använd delat verktyg för dokumentsökning
  const searchProjectDocuments = createSearchProjectDocumentsTool({ db, tenantId, userId, projectId });

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

  // Använd delat verktyg för Excel-generering
  const generateExcelDocument = createGenerateExcelDocumentTool({ db, tenantId, userId, projectId });

  // Använd delat verktyg för PDF-generering
  const generatePdfDocument = createGeneratePdfDocumentTool({ db, tenantId, userId, projectId });

  // Använd delat verktyg för Word-generering
  const generateWordDocument = createGenerateWordDocumentTool({ db, tenantId, userId, projectId });

  const getTaskComments = tool({
    description:
      "Hämta alla kommentarer för en uppgift. Returnerar kommentarer i kronologisk ordning med författare, innehåll och tidsstämplar.",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("Uppgiftens ID som kommentarerna ska hämtas för"),
    })),
    execute: async ({ taskId }) => {
      // Verifiera att uppgiften tillhör projektet
      const task = await db.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true },
      });
      if (!task) {
        return { error: "Uppgiften hittades inte i detta projekt." };
      }

      // Hämta kommentarer
      const comments = await db.comment.findMany({
        where: { taskId },
        orderBy: { createdAt: "asc" },
      });

      // Hämta författarinformation
      const authorIds = [...new Set(comments.map((c) => c.authorId))];
      const { prisma } = await import("@/lib/db");
      const users = await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      return comments.map((c) => {
        const author = userMap.get(c.authorId);
        return {
          id: c.id,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          author: author
            ? { name: author.name ?? author.email, email: author.email }
            : { name: "Okänd användare", email: "unknown" },
        };
      });
    },
  });

  const createComment = tool({
    description:
      "Skapa en kommentar på en uppgift. Använd detta för att lämna statusuppdateringar, frågor eller information om uppgiften. Kommentaren kommer från projekt-AI:n.",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("Uppgiftens ID som kommentaren ska läggas till på"),
      content: z.string().min(1).max(5000).describe("Kommentarens innehåll"),
    })),
    execute: async ({ taskId, content }) => {
      // Verifiera att uppgiften tillhör projektet
      const task = await db.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true, title: true },
      });
      if (!task) {
        return { error: "Uppgiften hittades inte i detta projekt." };
      }

      // Skapa kommentar
      const comment = await db.comment.create({
        data: {
          content,
          authorId: userId,
          task: { connect: { id: taskId } },
        },
      });

      return {
        id: comment.id,
        message: `Kommentar skapad på uppgiften "${task.title}".`,
      };
    },
  });

  const updateComment = tool({
    description:
      "Uppdatera en befintlig kommentar. Endast kommentarer som projekt-AI:n själv skapat kan uppdateras.",
    inputSchema: toolInputSchema(z.object({
      commentId: z.string().describe("Kommentarens ID som ska uppdateras"),
      content: z.string().min(1).max(5000).describe("Nytt innehåll för kommentaren"),
    })),
    execute: async ({ commentId, content }) => {
      // Hämta kommentar och verifiera
      const comment = await db.comment.findFirst({
        where: { id: commentId },
        include: { task: { select: { projectId: true } } },
      });
      if (!comment) {
        return { error: "Kommentaren hittades inte." };
      }
      if (comment.task.projectId !== projectId) {
        return { error: "Kommentaren tillhör inte detta projekt." };
      }
      if (comment.authorId !== userId) {
        return { error: "Endast författaren kan uppdatera sin egen kommentar." };
      }

      // Uppdatera kommentar
      await db.comment.update({
        where: { id: commentId },
        data: { content },
      });

      return { id: commentId, message: "Kommentar uppdaterad." };
    },
  });

  const deleteComment = tool({
    description:
      "Ta bort en kommentar. Endast kommentarer som projekt-AI:n själv skapat kan tas bort.",
    inputSchema: toolInputSchema(z.object({
      commentId: z.string().describe("Kommentarens ID som ska tas bort"),
    })),
    execute: async ({ commentId }) => {
      // Hämta kommentar och verifiera
      const comment = await db.comment.findFirst({
        where: { id: commentId },
        include: { task: { select: { projectId: true } } },
      });
      if (!comment) {
        return { error: "Kommentaren hittades inte." };
      }
      if (comment.task.projectId !== projectId) {
        return { error: "Kommentaren tillhör inte detta projekt." };
      }
      if (comment.authorId !== userId) {
        return { error: "Endast författaren kan ta bort sin egen kommentar." };
      }

      // Ta bort kommentar
      await db.comment.delete({
        where: { id: commentId },
      });

      return { message: "Kommentar borttagen." };
    },
  });

  const getProjectTimeEntries = tool({
    description:
      "Hämta tidsrapporter för projektet. Returnerar tidsposter grupperade per datum med uppgiftsinformation.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(200).optional().default(100).describe("Max antal tidsposter att hämta"),
    })),
    execute: async ({ limit = 100 }) => {
      const entries = await db.timeEntry.findMany({
        where: { projectId },
        include: {
          task: { select: { id: true, title: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      // Hämta användardata separat (timeEntry har userId men ingen user-relation)
      const userIds = [...new Set(entries.map((e) => e.userId))];
      const { prisma } = await import("@/lib/db");
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      return entries.map((entry) => {
        const user = userMap.get(entry.userId);
        return {
          id: entry.id,
          taskId: entry.task?.id ?? null,
          taskTitle: entry.task?.title ?? null,
          minutes: entry.minutes,
          hours: Math.floor(entry.minutes / 60),
          remainingMinutes: entry.minutes % 60,
          date: entry.date.toISOString().split("T")[0],
          description: entry.description,
          userName: user ? (user.name ?? user.email) : "Okänd användare",
          userId: entry.userId,
          createdAt: entry.createdAt.toISOString(),
        };
      });
    },
  });

  const createTimeEntry = tool({
    description:
      "Skapa en ny tidsrapport för en uppgift i projektet. Ange taskId (från getProjectTasks), antal minuter eller timmar, datum (YYYY-MM-DD) och valfri beskrivning.",
    inputSchema: toolInputSchema(z.object({
      taskId: z.string().describe("Uppgiftens ID (från getProjectTasks)"),
      minutes: z.number().int().positive().optional().describe("Antal minuter (använd antingen minutes eller hours)"),
      hours: z.number().positive().optional().describe("Antal timmar (konverteras till minuter)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Datum i format YYYY-MM-DD, t.ex. 2026-02-12"),
      description: z.string().max(500).optional().describe("Beskrivning av det utförda arbetet"),
    })),
    execute: async ({ taskId, minutes, hours, date, description }) => {
      // Validera att antingen minutes eller hours anges
      if (!minutes && !hours) {
        return { error: "Du måste ange antingen minutes eller hours." };
      }

      // Beräkna minuter
      const totalMinutes = minutes ?? Math.round((hours ?? 0) * 60);

      if (totalMinutes <= 0) {
        return { error: "Tid måste vara större än 0." };
      }

      // Kontrollera att uppgiften finns i projektet
      const task = await db.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true, title: true },
      });
      if (!task) {
        return { error: "Uppgiften hittades inte i detta projekt." };
      }

      // Skapa tidsposten
      const created = await db.timeEntry.create({
        data: {
          taskId: task.id,
          projectId,
          userId,
          minutes: totalMinutes,
          date: new Date(date),
          description: description?.trim() || null,
        },
        include: {
          task: { select: { title: true } },
        },
      });

      return {
        id: created.id,
        taskId: created.taskId,
        taskTitle: created.task?.title ?? null,
        minutes: created.minutes,
        hours: Math.floor(created.minutes / 60),
        remainingMinutes: created.minutes % 60,
        date: created.date.toISOString().split("T")[0],
        description: created.description,
        message: `Tidsrapport skapad: ${Math.floor(created.minutes / 60)}h ${created.minutes % 60}min på ${created.task?.title}`,
      };
    },
  });

  const updateTimeEntry = tool({
    description:
      "Uppdatera en befintlig tidsrapport. Endast användaren som skapade tidsrapporten kan uppdatera den. Ange timeEntryId och de fält som ska ändras.",
    inputSchema: toolInputSchema(z.object({
      timeEntryId: z.string().describe("Tidsrapportens ID"),
      taskId: z.string().optional().describe("Ny uppgift (om tidsrapporten ska flyttas)"),
      minutes: z.number().int().positive().optional().describe("Nytt antal minuter"),
      hours: z.number().positive().optional().describe("Nytt antal timmar (konverteras till minuter)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Nytt datum i format YYYY-MM-DD"),
      description: z.string().max(500).optional().describe("Ny beskrivning"),
    })),
    execute: async ({ timeEntryId, taskId, minutes, hours, date, description }) => {
      // Kontrollera att tidsposten finns och tillhör aktuell användare
      const existing = await db.timeEntry.findFirst({
        where: { id: timeEntryId, userId, projectId },
      });

      if (!existing) {
        return { error: "Tidsrapporten hittades inte eller så saknar du behörighet att uppdatera den (endast egna tidsrapporter kan ändras)." };
      }

      // Om ny uppgift anges, kontrollera att den finns i projektet
      let targetTaskId = existing.taskId;
      if (taskId) {
        const task = await db.task.findFirst({
          where: { id: taskId, projectId },
          select: { id: true },
        });
        if (!task) {
          return { error: "Den angivna uppgiften hittades inte i projektet." };
        }
        targetTaskId = task.id;
      }

      // Beräkna nya minuter om hours anges
      let totalMinutes = existing.minutes;
      if (hours !== undefined) {
        totalMinutes = Math.round(hours * 60);
      } else if (minutes !== undefined) {
        totalMinutes = minutes;
      }

      if (totalMinutes <= 0) {
        return { error: "Tid måste vara större än 0." };
      }

      // Uppdatera tidsposten
      const updated = await db.timeEntry.update({
        where: { id: existing.id },
        data: {
          taskId: targetTaskId,
          minutes: totalMinutes,
          date: date ? new Date(date) : existing.date,
          description: description !== undefined ? (description.trim() || null) : existing.description,
        },
        include: {
          task: { select: { title: true } },
        },
      });

      return {
        id: updated.id,
        taskId: updated.taskId,
        taskTitle: updated.task?.title ?? null,
        minutes: updated.minutes,
        hours: Math.floor(updated.minutes / 60),
        remainingMinutes: updated.minutes % 60,
        date: updated.date.toISOString().split("T")[0],
        description: updated.description,
        message: "Tidsrapport uppdaterad.",
      };
    },
  });

  const deleteTimeEntry = tool({
    description:
      "Ta bort en tidsrapport. Endast användaren som skapade tidsrapporten kan ta bort den.",
    inputSchema: toolInputSchema(z.object({
      timeEntryId: z.string().describe("Tidsrapportens ID som ska tas bort"),
    })),
    execute: async ({ timeEntryId }) => {
      // Kontrollera att tidsposten finns och tillhör aktuell användare
      const existing = await db.timeEntry.findFirst({
        where: { id: timeEntryId, userId, projectId },
        include: {
          task: { select: { title: true } },
        },
      });

      if (!existing) {
        return { error: "Tidsrapporten hittades inte eller så saknar du behörighet att ta bort den (endast egna tidsrapporter kan tas bort)." };
      }

      // Ta bort tidsposten
      await db.timeEntry.delete({
        where: { id: existing.id },
      });

      return {
        message: `Tidsrapport borttagen: ${Math.floor(existing.minutes / 60)}h ${existing.minutes % 60}min på ${existing.task?.title ?? "uppgift"}`,
      };
    },
  });

  const getProjectTimeSummary = tool({
    description:
      "Hämta en sammanfattning av registrerad tid i projektet. Visar total tid, tid per uppgift, tid per person, och tid per dag/vecka.",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      const entries = await db.timeEntry.findMany({
        where: { projectId },
        include: {
          task: { select: { id: true, title: true } },
        },
        orderBy: { date: "desc" },
      });

      const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

      // Hämta användardata separat
      const userIds = [...new Set(entries.map((e) => e.userId))];
      const { prisma } = await import("@/lib/db");
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      // Gruppera per uppgift
      const taskTotals = new Map<string, { taskId: string; taskTitle: string; totalMinutes: number }>();
      for (const entry of entries) {
        if (entry.task) {
          const current = taskTotals.get(entry.task.id);
          if (!current) {
            taskTotals.set(entry.task.id, {
              taskId: entry.task.id,
              taskTitle: entry.task.title,
              totalMinutes: entry.minutes,
            });
          } else {
            current.totalMinutes += entry.minutes;
          }
        }
      }

      // Gruppera per person
      const personTotals = new Map<string, { userId: string; userName: string; totalMinutes: number }>();
      for (const entry of entries) {
        const user = userMap.get(entry.userId);
        const userName = user ? (user.name ?? user.email) : "Okänd användare";
        const current = personTotals.get(entry.userId);
        if (!current) {
          personTotals.set(entry.userId, {
            userId: entry.userId,
            userName,
            totalMinutes: entry.minutes,
          });
        } else {
          current.totalMinutes += entry.minutes;
        }
      }

      // Gruppera per dag
      const dayTotals = new Map<string, number>();
      for (const entry of entries) {
        const dayKey = entry.date.toISOString().split("T")[0];
        dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + entry.minutes);
      }

      // Gruppera per vecka (måndagar)
      const weekTotals = new Map<string, number>();
      for (const entry of entries) {
        const date = new Date(entry.date);
        const day = date.getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(date);
        monday.setUTCDate(date.getUTCDate() + mondayOffset);
        const weekKey = monday.toISOString().split("T")[0];
        weekTotals.set(weekKey, (weekTotals.get(weekKey) ?? 0) + entry.minutes);
      }

      return {
        totalMinutes,
        totalHours: Math.floor(totalMinutes / 60),
        totalRemainingMinutes: totalMinutes % 60,
        byTask: Array.from(taskTotals.values())
          .sort((a, b) => b.totalMinutes - a.totalMinutes)
          .map((t) => ({
            ...t,
            hours: Math.floor(t.totalMinutes / 60),
            remainingMinutes: t.totalMinutes % 60,
          })),
        byPerson: Array.from(personTotals.values())
          .sort((a, b) => b.totalMinutes - a.totalMinutes)
          .map((p) => ({
            ...p,
            hours: Math.floor(p.totalMinutes / 60),
            remainingMinutes: p.totalMinutes % 60,
          })),
        byDay: Array.from(dayTotals.entries())
          .map(([date, minutes]) => ({
            date,
            totalMinutes: minutes,
            hours: Math.floor(minutes / 60),
            remainingMinutes: minutes % 60,
          }))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 30), // Senaste 30 dagarna
        byWeek: Array.from(weekTotals.entries())
          .map(([weekStart, minutes]) => ({
            weekStart,
            totalMinutes: minutes,
            hours: Math.floor(minutes / 60),
            remainingMinutes: minutes % 60,
          }))
          .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
          .slice(0, 12), // Senaste 12 veckorna
      };
    },
  });

  const generateProjectReport = tool({
    description:
      "Generera en sammanfattande projektrapport med AI. Rapporten sammanställer projektdata (uppgifter, status, tidsrapporter, medlemmar) och genererar en professionell sammanfattning. Sparas som PDF i projektets fillista.",
    inputSchema: toolInputSchema(z.object({
      fileName: z.string().optional().describe("Filnamn med .pdf, t.ex. projektrapport.pdf. Om inget anges används 'projektrapport-[datum].pdf'"),
      includeTimeReport: z.boolean().optional().default(true).describe("Inkludera tidrapporter i rapporten"),
    })),
    execute: async ({ fileName, includeTimeReport = true }) => {
      // Kontrollera att OpenAI-nyckel finns tillgänglig
      if (!process.env.OPENAI_API_KEY?.trim()) {
        return { error: "OpenAI API-nyckel saknas. Rapportgenerering kräver OPENAI_API_KEY i miljövariablerna." };
      }

      try {
        // Hämta projektdata
        const [project, tasks, members, timeEntries] = await Promise.all([
          db.project.findUnique({
            where: { id: projectId },
            select: {
              name: true,
              description: true,
              address: true,
              status: true,
              createdAt: true,
            },
          }),
          db.task.findMany({
            where: { projectId },
            include: {
              assignments: {
                include: {
                  membership: {
                    include: {
                      user: { select: { name: true, email: true } },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          }),
          db.projectMember.findMany({
            where: { projectId },
            include: {
              membership: {
                include: {
                  user: { select: { name: true, email: true } },
                },
              },
            },
          }),
          includeTimeReport
            ? db.timeEntry.findMany({
                where: { projectId },
                include: {
                  task: { select: { title: true } },
                },
                orderBy: { date: "desc" },
              })
            : Promise.resolve([]),
        ]);

        if (!project) {
          return { error: "Projektet hittades inte." };
        }

        // Sammanställ data för AI-generering
        const tasksByStatus = {
          TODO: tasks.filter((t) => t.status === "TODO").length,
          IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
          DONE: tasks.filter((t) => t.status === "DONE").length,
        };

        const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;

        // Bygg dataprompt för AI
        const dataPrompt = `
Du är en projektrapportgenerator. Generera en professionell sammanfattande rapport för följande projekt:

PROJEKTINFORMATION:
- Namn: ${project.name}
- Beskrivning: ${project.description || "Ingen beskrivning"}
- Adress: ${project.address || "Ej angiven"}
- Status: ${project.status}
- Startdatum: ${project.createdAt.toLocaleDateString("sv-SE")}

UPPGIFTER:
- Totalt antal uppgifter: ${tasks.length}
- Att göra: ${tasksByStatus.TODO}
- Pågående: ${tasksByStatus.IN_PROGRESS}
- Klara: ${tasksByStatus.DONE}

${
  tasks.length > 0
    ? `De senaste uppgifterna:\n${tasks
        .slice(0, 10)
        .map(
          (t, i) =>
            `${i + 1}. ${t.title} (${t.status}${t.deadline ? `, deadline: ${t.deadline.toLocaleDateString("sv-SE")}` : ""})`
        )
        .join("\n")}`
    : ""
}

TEAMMEDLEMMAR:
${members
  .map(
    (m) =>
      `- ${m.membership.user.name || m.membership.user.email}`
  )
  .join("\n")}

${
  includeTimeReport && timeEntries.length > 0
    ? `TIDRAPPORTERING:
- Totalt registrerad tid: ${totalHours}h ${remainingMinutes}min
- Antal tidsposter: ${timeEntries.length}
- Senaste 5 tidsposter:
${timeEntries
  .slice(0, 5)
  .map(
    (te) =>
      `  - ${te.date.toLocaleDateString("sv-SE")}: ${Math.floor(te.minutes / 60)}h ${te.minutes % 60}min${te.task ? ` (${te.task.title})` : ""}${te.description ? ` - ${te.description}` : ""}`
  )
  .join("\n")}`
    : ""
}

Generera en rapport på svenska som inkluderar:
1. Sammanfattning av projektets status och framsteg
2. Analys av uppgiftsfördelningen och vad som är kvar att göra
3. Översikt av teamet${includeTimeReport ? " och nedlagd tid" : ""}
4. Eventuella observationer eller rekommendationer

Håll texten professionell men lättläst. Cirka 300-500 ord.
`.trim();

        // Generera rapport med AI
        const { text: aiSummary } = await generateText({
          model: openai("gpt-4o"),
          prompt: dataPrompt,
          temperature: 0.7,
        });

        // Bygg PDF-innehåll
        const reportContent = `
${aiSummary}

═══════════════════════════════════════

DETALJERAD STATISTIK

Projektinformation:
• Namn: ${project.name}
• Status: ${project.status}
• Adress: ${project.address || "Ej angiven"}
• Startdatum: ${project.createdAt.toLocaleDateString("sv-SE")}

Uppgifter:
• Totalt: ${tasks.length}
• Att göra: ${tasksByStatus.TODO}
• Pågående: ${tasksByStatus.IN_PROGRESS}
• Klara: ${tasksByStatus.DONE}
• Andel klart: ${tasks.length > 0 ? Math.round((tasksByStatus.DONE / tasks.length) * 100) : 0}%

Team:
• Antal medlemmar: ${members.length}
${members.map((m) => `• ${m.membership.user.name || m.membership.user.email}`).join("\n")}

${
  includeTimeReport && timeEntries.length > 0
    ? `Tidrapportering:
• Total tid: ${totalHours}h ${remainingMinutes}min
• Antal poster: ${timeEntries.length}
• Genomsnitt per post: ${timeEntries.length > 0 ? Math.round(totalMinutes / timeEntries.length) : 0} min`
    : ""
}

═══════════════════════════════════════

Genererad: ${new Date().toLocaleString("sv-SE")}
        `.trim();

        // Generera PDF
        const finalFileName =
          fileName && fileName.toLowerCase().endsWith(".pdf")
            ? fileName
            : fileName
              ? `${fileName}.pdf`
              : `projektrapport-${new Date().toISOString().split("T")[0]}.pdf`;

        const buffer = await buildSimplePdf(`Projektrapport: ${project.name}`, reportContent);
        const saved = await saveGeneratedDocumentToProject({
          db,
          tenantId,
          projectId,
          userId,
          fileName: finalFileName,
          contentType: "application/pdf",
          buffer,
        });

        if ("error" in saved) {
          return { error: saved.error };
        }

        return {
          fileId: saved.fileId,
          name: saved.name,
          summary: aiSummary.slice(0, 200) + "...",
          message: "Projektrapport genererad och sparad i projektets fillista.",
        };
      } catch (err) {
        return {
          error: `Fel vid rapportgenerering: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ─── Anteckningar (Notes) ───────────────────────────

  const getProjectNotes = tool({
    description:
      "Hämta anteckningar från projektet. Kan filtrera på kategori. Anteckningar är viktig information som inte är uppgifter (t.ex. beslut, teknisk info, kundönskemål).",
    inputSchema: toolInputSchema(z.object({
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Filtrera på kategori"),
      limit: z.number().min(1).max(50).optional().default(20),
    })),
    execute: async ({ category, limit = 20 }) => {
      const where: Record<string, unknown> = { projectId };
      if (category) where.category = category;

      const notes = await db.note.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map((n: typeof notes[0]) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        category: n.category,
        isPinned: n.isPinned,
        createdBy: n.createdBy.name ?? n.createdBy.email,
        createdAt: n.createdAt.toISOString(),
      }));
    },
  });

  const createProjectNote = tool({
    description:
      "Skapa en viktig anteckning i projektet (t.ex. beslut, teknisk info, kundönskemål). Anteckningar är inte uppgifter utan viktig information som behöver sparas.",
    inputSchema: toolInputSchema(z.object({
      content: z.string().describe("Anteckningens innehåll"),
      title: z.string().optional().describe("Valfri titel för anteckningen"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Kategori för anteckningen"),
    })),
    execute: async ({ content, title, category }) => {
      const note = await db.note.create({
        data: {
          title: title ?? "",
          content,
          category: category ?? null,
          projectId,
          createdById: userId,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      return {
        id: note.id,
        title: note.title,
        content: note.content,
        category: note.category,
        createdAt: note.createdAt.toISOString(),
        message: "Anteckning skapad.",
      };
    },
  });

  const updateProjectNote = tool({
    description: "Uppdatera en befintlig anteckning i projektet.",
    inputSchema: toolInputSchema(z.object({
      noteId: z.string().describe("Anteckningens ID"),
      content: z.string().optional().describe("Nytt innehåll"),
      title: z.string().optional().describe("Ny titel"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Ny kategori"),
    })),
    execute: async ({ noteId, content, title, category }) => {
      const existing = await db.note.findFirst({
        where: { id: noteId, projectId },
      });
      if (!existing) return { error: "Anteckningen hittades inte i detta projekt." };

      const updateData: Record<string, unknown> = {};
      if (content !== undefined) updateData.content = content;
      if (title !== undefined) updateData.title = title;
      if (category !== undefined) updateData.category = category;

      const note = await db.note.update({
        where: { id: noteId },
        data: updateData,
      });

      return {
        id: note.id,
        title: note.title,
        content: note.content,
        category: note.category,
        message: "Anteckning uppdaterad.",
      };
    },
  });

  const deleteProjectNote = tool({
    description: "Ta bort en anteckning från projektet.",
    inputSchema: toolInputSchema(z.object({
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ noteId }) => {
      const existing = await db.note.findFirst({
        where: { id: noteId, projectId },
      });
      if (!existing) return { error: "Anteckningen hittades inte i detta projekt." };

      await db.note.delete({ where: { id: noteId } });
      return { success: true, message: "Anteckning borttagen." };
    },
  });

  const searchProjectNotes = tool({
    description:
      "Sök bland anteckningar i projektet. Söker i titel och innehåll.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökord eller fras"),
      limit: z.number().min(1).max(50).optional().default(20),
    })),
    execute: async ({ query, limit = 20 }) => {
      const notes = await db.note.findMany({
        where: {
          projectId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { content: { contains: query, mode: "insensitive" } },
          ],
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map((n: typeof notes[0]) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        category: n.category,
        isPinned: n.isPinned,
        createdBy: n.createdBy.name ?? n.createdBy.email,
        createdAt: n.createdAt.toISOString(),
      }));
    },
  });

  return {
    getProjectTasks,
    createTask,
    updateTask,
    assignTask,
    unassignTask,
    deleteTask,
    getProjectFiles,
    searchProjectDocuments,
    getProjectMembers,
    sendAIMessageToPersonal,
    getRepliesFromPersonalAI,
    analyzeDocument,
    generateExcelDocument,
    generatePdfDocument,
    generateWordDocument,
    generateProjectReport,
    getTaskComments,
    createComment,
    updateComment,
    deleteComment,
    getProjectTimeEntries,
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getProjectTimeSummary,
    getProjectNotes,
    createNote: createProjectNote,
    updateNote: updateProjectNote,
    deleteNote: deleteProjectNote,
    searchNotes: searchProjectNotes,
  };
}
