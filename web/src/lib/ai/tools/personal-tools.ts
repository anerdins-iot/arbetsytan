/**
 * Personal AI tools. All use tenantDb(tenantId). Conversation owned by userId.
 */
import { tool } from "ai";
import { z } from "zod";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import { searchDocumentsGlobal } from "@/lib/ai/embeddings";
import { requireProject } from "@/lib/auth";
import type { TenantScopedClient } from "@/lib/db";

export type PersonalToolsContext = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
};

export function createPersonalTools(ctx: PersonalToolsContext) {
  const { db, tenantId, userId } = ctx;

  const getUnreadAIMessages = tool({
    description:
      "Hämta användarens olästa AIMessages från projekt-AI:er. Börja alltid med att anropa detta för att se om det finns nya notiser (uppgifter, deadlines, etc.).",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(50).default(20).describe("Max antal meddelanden"),
    })),
    execute: async ({ limit }: { limit: number }) => {
      const messages = await db.aIMessage.findMany({
        where: { userId, read: false, direction: "PROJECT_TO_PERSONAL" },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
        },
      });
      return messages.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        projectName: m.project.name,
        projectId: m.project.id,
        createdAt: m.createdAt.toISOString(),
      }));
    },
  });

  const markAIMessageRead = tool({
    description: "Markera ett AIMessage som läst. Ange meddelandets id.",
    inputSchema: toolInputSchema(z.object({
      messageId: z.string().describe("AIMessage-id att markera som läst"),
    })),
    execute: async ({ messageId }) => {
      const msg = await db.aIMessage.findFirst({
        where: { id: messageId, userId },
      });
      if (!msg) return { error: "Meddelandet hittades inte." };
      await db.aIMessage.update({
        where: { id: messageId },
        data: { read: true },
      });
      return { success: true, message: "Markerat som läst." };
    },
  });

  const sendAIMessageToProject = tool({
    description:
      "Skicka ett meddelande till projekt-AI:n (t.ex. att användaren bekräftat en uppgift eller svarar på en fråga). Ange projectId, typ och innehåll. Använd parentId för att svara på ett tidigare meddelande (trådning).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      type: z.string().describe("Typ, t.ex. task_acknowledged, question, status_update"),
      content: z.string().describe("Meddelandets innehåll på svenska"),
      parentId: z.string().optional().describe("ID på det AIMessage detta är svar på (trådning)"),
    })),
    execute: async ({ projectId: pid, type, content, parentId }) => {
      await requireProject(tenantId, pid, userId);
      await db.aIMessage.create({
        data: {
          direction: "PERSONAL_TO_PROJECT",
          type,
          content,
          userId,
          projectId: pid,
          parentId: parentId ?? null,
        },
      });
      return { success: true, message: "Meddelande skickat till projekt-AI." };
    },
  });

  const getUserTasks = tool({
    description:
      "Hämta användarens uppgifter från alla projekt användaren är med i. Returnerar uppgifter med projekt, status, prioritet, deadline och tilldelning.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(50).optional().default(30),
    })),
    execute: async ({ limit }) => {
      const projectIds = (
        await db.projectMember.findMany({
          where: { membership: { userId } },
          select: { projectId: true },
        })
      ).map((p) => p.projectId);
      if (projectIds.length === 0) return { tasks: [], projects: [] };
      const tasks = await db.task.findMany({
        where: { projectId: { in: projectIds } },
        include: {
          project: { select: { id: true, name: true } },
          assignments: {
            include: {
              membership: {
                include: { user: { select: { name: true, email: true } } },
              },
            },
          },
        },
        orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
        take: limit,
      });
      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline?.toISOString() ?? null,
        projectName: t.project.name,
        projectId: t.project.id,
        assignees: t.assignments.map((a) => a.membership.user.name ?? a.membership.user.email),
      }));
    },
  });

  const getProjectList = tool({
    description: "Hämta listan över projekt som användaren är medlem i (id, namn, status).",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      const projects = await db.project.findMany({
        where: {
          projectMembers: { some: { membership: { userId } } },
        },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      });
      return projects.map((p) => ({ id: p.id, name: p.name, status: p.status }));
    },
  });

  const searchFiles = tool({
    description:
      "Söka i dokument (PDF, ritningar) över alla projekt användaren har tillgång till. Semantisk sökning; ange en fråga eller sökord.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökfråga eller nyckelord"),
      limit: z.number().min(1).max(15).optional().default(8),
    })),
    execute: async ({ query, limit }) => {
      const projectIds = (
        await db.projectMember.findMany({
          where: { membership: { userId } },
          select: { projectId: true },
        })
      ).map((p) => p.projectId);
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
    },
  });

  const createTask = tool({
    description:
      "Skapa en ny uppgift i ett projekt. Kräver projectId som användaren har tillgång till. Ange titel, valfritt beskrivning, prioritet och deadline.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      title: z.string().describe("Uppgiftens titel"),
      description: z.string().optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      deadline: z.string().optional().describe("ISO-datum YYYY-MM-DD"),
    })),
    execute: async ({ projectId: pid, title, description, priority, deadline }) => {
      await requireProject(tenantId, pid, userId);
      const task = await db.task.create({
        data: {
          title,
          description: description ?? null,
          priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          status: "TODO",
          deadline: deadline ? new Date(deadline) : null,
          projectId: pid,
        },
      });
      return { id: task.id, title: task.title, status: task.status, message: "Uppgift skapad." };
    },
  });

  const updateTask = tool({
    description:
      "Uppdatera en uppgift i ett projekt. Kräver projectId och taskId. Ange de fält som ska ändras.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      deadline: z.string().optional().nullable(),
    })),
    execute: async ({ projectId: pid, taskId, title, description, status, priority, deadline }) => {
      await requireProject(tenantId, pid, userId);
      const existing = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
      });
      if (!existing) return { error: "Uppgiften hittades inte i projektet." };
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

  return {
    getUnreadAIMessages,
    markAIMessageRead,
    sendAIMessageToProject,
    getUserTasks,
    getProjectList,
    searchFiles,
    createTask,
    updateTask,
  };
}
