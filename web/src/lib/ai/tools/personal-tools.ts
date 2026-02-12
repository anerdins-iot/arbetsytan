/**
 * Personal AI tools. All use tenantDb(tenantId). Conversation owned by userId.
 * Personlig AI har direkt tillgång till användarens projekt via projectId-parameter.
 */
import { tool } from "ai";
import { z } from "zod";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import { requireProject } from "@/lib/auth";
import type { TenantScopedClient } from "@/lib/db";
import {
  createTaskShared,
  updateTaskShared,
  searchDocumentsAcrossProjects,
  parseScheduleFromText,
} from "@/lib/ai/tools/shared-tools";
import { getOcrTextForFile } from "@/lib/ai/ocr";
import {
  createAutomation as createAutomationAction,
  listAutomations as listAutomationsAction,
  deleteAutomation as deleteAutomationAction,
} from "@/actions/automations";
import {
  copyObjectInMinio,
  projectObjectKey,
  ensureTenantBucket,
} from "@/lib/minio";
import { randomUUID } from "node:crypto";

export type PersonalToolsContext = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
};

export function createPersonalTools(ctx: PersonalToolsContext) {
  const { db, tenantId, userId } = ctx;

  // ─── AIMessages ───────────────────────────────────────

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

  // ─── Projektlista och översikt ────────────────────────

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

  // ─── Uppgifter (Tasks) ────────────────────────────────

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

  const getProjectTasks = tool({
    description:
      "Hämta alla uppgifter i ett specifikt projekt. Kräver projectId. Returnerar titel, beskrivning, status, prioritet, deadline och tilldelade personer.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal uppgifter"),
    })),
    execute: async ({ projectId: pid, limit = 50 }) => {
      await requireProject(tenantId, pid, userId);
      const tasks = await db.task.findMany({
        where: { projectId: pid },
        include: {
          project: { select: { id: true, name: true } },
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
        projectName: t.project.name,
        projectId: t.project.id,
        assignees: t.assignments.map((a) => ({
          membershipId: a.membershipId,
          name: a.membership.user.name ?? a.membership.user.email,
          email: a.membership.user.email,
        })),
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
      return createTaskShared({
        db,
        projectId: pid,
        title,
        description,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        deadline,
      });
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
      return updateTaskShared({
        db,
        projectId: pid,
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
      "Tilldela en uppgift till en projektmedlem. Kräver projectId, taskId och membershipId (från getProjectMembers).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
      membershipId: z.string().describe("MembershipId för den som ska tilldelas (från getProjectMembers)"),
    })),
    execute: async ({ projectId: pid, taskId, membershipId }) => {
      await requireProject(tenantId, pid, userId);

      const task = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
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

      return { id: task.id, message: `Uppgiften "${task.title}" har tilldelats.` };
    },
  });

  const deleteTask = tool({
    description:
      "Ta bort en uppgift från ett projekt. VIKTIGT: Kan inte ångras. Uppgiften och alla dess tilldelningar raderas.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("ID för uppgiften som ska tas bort"),
      confirmDeletion: z.boolean().describe("Måste vara true för att bekräfta permanent borttagning"),
    })),
    execute: async ({ projectId: pid, taskId, confirmDeletion }) => {
      if (!confirmDeletion) {
        return { error: "Radering avbröts: confirmDeletion måste vara true." };
      }
      await requireProject(tenantId, pid, userId);

      const task = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
        select: { id: true, title: true, status: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

      await db.taskAssignment.deleteMany({ where: { taskId } });
      await db.task.delete({ where: { id: taskId } });

      return {
        success: true,
        deletedTaskId: taskId,
        message: `Uppgiften "${task.title}" har tagits bort permanent.`,
      };
    },
  });

  // ─── Kommentarer (Comments) ───────────────────────────

  const getTaskComments = tool({
    description:
      "Hämta alla kommentarer för en uppgift i ett projekt. Returnerar kommentarer i kronologisk ordning.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
    })),
    execute: async ({ projectId: pid, taskId }) => {
      await requireProject(tenantId, pid, userId);

      const task = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
        select: { id: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

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
      "Skapa en kommentar på en uppgift i ett projekt. Kommentaren skapas som den inloggade användaren.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
      content: z.string().min(1).max(5000).describe("Kommentarens innehåll"),
    })),
    execute: async ({ projectId: pid, taskId, content }) => {
      await requireProject(tenantId, pid, userId);

      const task = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
        select: { id: true, title: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

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
      "Uppdatera en kommentar. Endast kommentarer som användaren själv skapat kan uppdateras.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      commentId: z.string().describe("Kommentarens ID"),
      content: z.string().min(1).max(5000).describe("Nytt innehåll"),
    })),
    execute: async ({ projectId: pid, commentId, content }) => {
      await requireProject(tenantId, pid, userId);

      const comment = await db.comment.findFirst({
        where: { id: commentId },
        include: { task: { select: { projectId: true } } },
      });
      if (!comment) return { error: "Kommentaren hittades inte." };
      if (comment.task.projectId !== pid) return { error: "Kommentaren tillhör inte detta projekt." };
      if (comment.authorId !== userId) return { error: "Endast författaren kan uppdatera sin egen kommentar." };

      await db.comment.update({
        where: { id: commentId },
        data: { content },
      });

      return { id: commentId, message: "Kommentar uppdaterad." };
    },
  });

  const deleteComment = tool({
    description:
      "Ta bort en kommentar. Endast kommentarer som användaren själv skapat kan tas bort.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      commentId: z.string().describe("Kommentarens ID"),
    })),
    execute: async ({ projectId: pid, commentId }) => {
      await requireProject(tenantId, pid, userId);

      const comment = await db.comment.findFirst({
        where: { id: commentId },
        include: { task: { select: { projectId: true } } },
      });
      if (!comment) return { error: "Kommentaren hittades inte." };
      if (comment.task.projectId !== pid) return { error: "Kommentaren tillhör inte detta projekt." };
      if (comment.authorId !== userId) return { error: "Endast författaren kan ta bort sin egen kommentar." };

      await db.comment.delete({ where: { id: commentId } });
      return { message: "Kommentar borttagen." };
    },
  });

  // ─── Tidrapportering (Time Entries) ───────────────────

  const getProjectTimeEntries = tool({
    description:
      "Hämta tidsrapporter för ett projekt. Returnerar tidsposter med uppgiftsinformation.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      limit: z.number().min(1).max(200).optional().default(100).describe("Max antal tidsposter"),
    })),
    execute: async ({ projectId: pid, limit = 100 }) => {
      await requireProject(tenantId, pid, userId);

      const entries = await db.timeEntry.findMany({
        where: { projectId: pid },
        include: {
          task: { select: { id: true, title: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      // Hämta användardata separat
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
      "Skapa en ny tidsrapport för en uppgift i ett projekt. Ange minuter eller timmar, datum och valfri beskrivning.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
      minutes: z.number().int().positive().optional().describe("Antal minuter"),
      hours: z.number().positive().optional().describe("Antal timmar (konverteras till minuter)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Datum YYYY-MM-DD"),
      description: z.string().max(500).optional().describe("Beskrivning av arbetet"),
    })),
    execute: async ({ projectId: pid, taskId, minutes, hours, date, description }) => {
      await requireProject(tenantId, pid, userId);

      if (!minutes && !hours) return { error: "Du måste ange antingen minutes eller hours." };
      const totalMinutes = minutes ?? Math.round((hours ?? 0) * 60);
      if (totalMinutes <= 0) return { error: "Tid måste vara större än 0." };

      const task = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
        select: { id: true, title: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

      const created = await db.timeEntry.create({
        data: {
          taskId: task.id,
          projectId: pid,
          userId,
          minutes: totalMinutes,
          date: new Date(date),
          description: description?.trim() || null,
        },
        include: { task: { select: { title: true } } },
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
      "Uppdatera en befintlig tidsrapport. Endast egna tidsrapporter kan uppdateras.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      timeEntryId: z.string().describe("Tidsrapportens ID"),
      taskId: z.string().optional().describe("Ny uppgift (om flytt)"),
      minutes: z.number().int().positive().optional().describe("Nytt antal minuter"),
      hours: z.number().positive().optional().describe("Nytt antal timmar"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Nytt datum YYYY-MM-DD"),
      description: z.string().max(500).optional().describe("Ny beskrivning"),
    })),
    execute: async ({ projectId: pid, timeEntryId, taskId, minutes, hours, date, description }) => {
      await requireProject(tenantId, pid, userId);

      const existing = await db.timeEntry.findFirst({
        where: { id: timeEntryId, userId, projectId: pid },
      });
      if (!existing) return { error: "Tidsrapporten hittades inte eller saknar behörighet." };

      let targetTaskId = existing.taskId;
      if (taskId) {
        const task = await db.task.findFirst({
          where: { id: taskId, projectId: pid },
          select: { id: true },
        });
        if (!task) return { error: "Den angivna uppgiften hittades inte i projektet." };
        targetTaskId = task.id;
      }

      let totalMinutes = existing.minutes;
      if (hours !== undefined) {
        totalMinutes = Math.round(hours * 60);
      } else if (minutes !== undefined) {
        totalMinutes = minutes;
      }
      if (totalMinutes <= 0) return { error: "Tid måste vara större än 0." };

      const updated = await db.timeEntry.update({
        where: { id: existing.id },
        data: {
          taskId: targetTaskId,
          minutes: totalMinutes,
          date: date ? new Date(date) : existing.date,
          description: description !== undefined ? (description.trim() || null) : existing.description,
        },
        include: { task: { select: { title: true } } },
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
      "Ta bort en tidsrapport. Endast egna tidsrapporter kan tas bort.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      timeEntryId: z.string().describe("Tidsrapportens ID"),
    })),
    execute: async ({ projectId: pid, timeEntryId }) => {
      await requireProject(tenantId, pid, userId);

      const existing = await db.timeEntry.findFirst({
        where: { id: timeEntryId, userId, projectId: pid },
        include: { task: { select: { title: true } } },
      });
      if (!existing) return { error: "Tidsrapporten hittades inte eller saknar behörighet." };

      await db.timeEntry.delete({ where: { id: existing.id } });

      return {
        message: `Tidsrapport borttagen: ${Math.floor(existing.minutes / 60)}h ${existing.minutes % 60}min på ${existing.task?.title ?? "uppgift"}`,
      };
    },
  });

  const getProjectTimeSummary = tool({
    description:
      "Hämta sammanfattning av registrerad tid i ett projekt. Visar total tid, tid per uppgift, tid per person och tid per vecka.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
    })),
    execute: async ({ projectId: pid }) => {
      await requireProject(tenantId, pid, userId);

      const entries = await db.timeEntry.findMany({
        where: { projectId: pid },
        include: { task: { select: { id: true, title: true } } },
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
            taskTotals.set(entry.task.id, { taskId: entry.task.id, taskTitle: entry.task.title, totalMinutes: entry.minutes });
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
          personTotals.set(entry.userId, { userId: entry.userId, userName, totalMinutes: entry.minutes });
        } else {
          current.totalMinutes += entry.minutes;
        }
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
          .map((t) => ({ ...t, hours: Math.floor(t.totalMinutes / 60), remainingMinutes: t.totalMinutes % 60 })),
        byPerson: Array.from(personTotals.values())
          .sort((a, b) => b.totalMinutes - a.totalMinutes)
          .map((p) => ({ ...p, hours: Math.floor(p.totalMinutes / 60), remainingMinutes: p.totalMinutes % 60 })),
        byWeek: Array.from(weekTotals.entries())
          .map(([weekStart, mins]) => ({ weekStart, totalMinutes: mins, hours: Math.floor(mins / 60), remainingMinutes: mins % 60 }))
          .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
          .slice(0, 12),
      };
    },
  });

  // ─── Filer (Files) ────────────────────────────────────

  const getProjectFiles = tool({
    description: "Hämta listan över filer i ett projekt (namn, typ, storlek, datum).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal filer"),
    })),
    execute: async ({ projectId: pid, limit = 50 }) => {
      await requireProject(tenantId, pid, userId);
      const files = await db.file.findMany({
        where: { projectId: pid },
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

  const getPersonalFiles = tool({
    description:
      "Hämta användarens personliga filer (filer uppladdade i chatten utan projektkontext). Returnerar namn, typ, storlek, datum och eventuell OCR-text.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal filer"),
    })),
    execute: async ({ limit = 50 }) => {
      const files = await db.file.findMany({
        where: { projectId: null, uploadedById: userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          createdAt: true,
          ocrText: true,
        },
      });
      return files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
        hasOcrText: !!f.ocrText,
        ocrPreview: f.ocrText ? f.ocrText.slice(0, 300) + (f.ocrText.length > 300 ? "…" : "") : null,
      }));
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
      return searchDocumentsAcrossProjects({ tenantId, projectIds, query, limit });
    },
  });

  const analyzeDocument = tool({
    description:
      "Analysera en PDF eller ritning (bild) i ett projekt med OCR. Ange projectId och fileId (från getProjectFiles). Returnerar extraherad text.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      fileId: z.string().describe("ID för filen som ska analyseras"),
    })),
    execute: async ({ projectId: pid, fileId }) => {
      await requireProject(tenantId, pid, userId);
      const result = await getOcrTextForFile({ fileId, projectId: pid, tenantId });
      if ("error" in result) return { error: result.error };
      return { fullText: result.fullText };
    },
  });

  const analyzePersonalFile = tool({
    description:
      "Hämta fullständig OCR-text för en personlig fil (från getPersonalFiles). Returnerar den extraherade texten från filen.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("ID för den personliga filen (från getPersonalFiles)"),
    })),
    execute: async ({ fileId }) => {
      const file = await db.file.findFirst({
        where: { id: fileId, projectId: null, uploadedById: userId },
        select: { id: true, name: true, ocrText: true },
      });
      if (!file) return { error: "Filen hittades inte eller du har inte behörighet." };
      if (!file.ocrText) return { error: "Ingen OCR-text finns för denna fil. Filen kanske inte är analyserad ännu." };
      return { fileName: file.name, fullText: file.ocrText };
    },
  });

  const movePersonalFileToProject = tool({
    description:
      "Flytta eller kopiera en personlig fil till ett projekt. Filen kopieras till projektets fillagring och kan valfritt tas bort från personliga filer.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("ID för den personliga filen (från getPersonalFiles)"),
      projectId: z.string().describe("Projektets ID dit filen ska flyttas"),
      deleteOriginal: z.boolean().optional().default(false).describe("Om true tas originalfilen bort efter kopiering"),
    })),
    execute: async ({ fileId, projectId: pid, deleteOriginal = false }) => {
      await requireProject(tenantId, pid, userId);

      const file = await db.file.findFirst({
        where: { id: fileId, projectId: null, uploadedById: userId },
        select: { id: true, name: true, type: true, size: true, bucket: true, key: true, ocrText: true },
      });
      if (!file) return { error: "Filen hittades inte eller du har inte behörighet." };

      // Generera ny nyckel för projektfilen
      const objectId = randomUUID();
      const newKey = projectObjectKey(pid, file.name, objectId);
      const bucket = await ensureTenantBucket(tenantId);

      // Kopiera objektet i MinIO
      try {
        await copyObjectInMinio({
          sourceBucket: file.bucket,
          sourceKey: file.key,
          destBucket: bucket,
          destKey: newKey,
        });
      } catch (err) {
        return { error: `Kunde inte kopiera filen: ${err instanceof Error ? err.message : String(err)}` };
      }

      // Skapa ny fil-post i projektet
      const newFile = await db.file.create({
        data: {
          name: file.name,
          type: file.type,
          size: file.size,
          bucket,
          key: newKey,
          projectId: pid,
          uploadedById: userId,
          ocrText: file.ocrText,
        },
      });

      // Ta bort originalet om så önskas
      if (deleteOriginal) {
        await db.file.delete({ where: { id: fileId } });
      }

      return {
        success: true,
        newFileId: newFile.id,
        projectId: pid,
        message: deleteOriginal
          ? `Filen "${file.name}" har flyttats till projektet.`
          : `Filen "${file.name}" har kopierats till projektet.`,
      };
    },
  });

  // ─── Projektmedlemmar ─────────────────────────────────

  const getProjectMembers = tool({
    description: "Hämta medlemmar i ett projekt med namn, e-post och membershipId.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
    })),
    execute: async ({ projectId: pid }) => {
      await requireProject(tenantId, pid, userId);
      const members = await db.projectMember.findMany({
        where: { projectId: pid },
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

  // ─── Projektanteckningar (Notes) ──────────────────────

  const getProjectNotes = tool({
    description:
      "Hämta anteckningar från ett projekt. Kan filtrera på kategori.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Filtrera på kategori"),
      limit: z.number().min(1).max(50).optional().default(20),
    })),
    execute: async ({ projectId: pid, category, limit = 20 }) => {
      await requireProject(tenantId, pid, userId);

      const where: Record<string, unknown> = { projectId: pid };
      if (category) where.category = category;

      const notes = await db.note.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map((n: typeof notes[number]) => ({
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
      "Skapa en anteckning i ett projekt (beslut, teknisk info, kundönskemål etc.).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      content: z.string().describe("Anteckningens innehåll"),
      title: z.string().optional().describe("Valfri titel"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Kategori"),
    })),
    execute: async ({ projectId: pid, content, title, category }) => {
      await requireProject(tenantId, pid, userId);

      const note = await db.note.create({
        data: {
          title: title ?? "",
          content,
          category: category ?? null,
          projectId: pid,
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
    description: "Uppdatera en befintlig anteckning i ett projekt.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      noteId: z.string().describe("Anteckningens ID"),
      content: z.string().optional().describe("Nytt innehåll"),
      title: z.string().optional().describe("Ny titel"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Ny kategori"),
    })),
    execute: async ({ projectId: pid, noteId, content, title, category }) => {
      await requireProject(tenantId, pid, userId);

      const existing = await db.note.findFirst({
        where: { id: noteId, projectId: pid },
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
    description: "Ta bort en anteckning från ett projekt.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ projectId: pid, noteId }) => {
      await requireProject(tenantId, pid, userId);

      const existing = await db.note.findFirst({
        where: { id: noteId, projectId: pid },
      });
      if (!existing) return { error: "Anteckningen hittades inte i detta projekt." };

      await db.note.delete({ where: { id: noteId } });
      return { success: true, message: "Anteckning borttagen." };
    },
  });

  const searchProjectNotes = tool({
    description:
      "Sök bland anteckningar i ett projekt. Söker i titel och innehåll.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      query: z.string().describe("Sökord eller fras"),
      limit: z.number().min(1).max(50).optional().default(20),
    })),
    execute: async ({ projectId: pid, query, limit = 20 }) => {
      await requireProject(tenantId, pid, userId);

      const notes = await db.note.findMany({
        where: {
          projectId: pid,
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

      return notes.map((n: typeof notes[number]) => ({
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

  // ─── Personliga anteckningar (utan projekt) ───────────

  const getPersonalNotes = tool({
    description:
      "Hämta användarens personliga anteckningar (inte kopplade till något projekt). Kan filtrera på kategori.",
    inputSchema: toolInputSchema(z.object({
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Filtrera på kategori"),
      limit: z.number().min(1).max(50).optional().default(20),
    })),
    execute: async ({ category, limit = 20 }) => {
      const where: Record<string, unknown> = { createdById: userId, projectId: null };
      if (category) where.category = category;

      const notes = await db.note.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map((n: typeof notes[number]) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        category: n.category,
        isPinned: n.isPinned,
        createdAt: n.createdAt.toISOString(),
      }));
    },
  });

  const createPersonalNote = tool({
    description:
      "Skapa en personlig anteckning (inte kopplad till något projekt). Använd för att spara personliga tankar, idéer eller information.",
    inputSchema: toolInputSchema(z.object({
      content: z.string().describe("Anteckningens innehåll"),
      title: z.string().optional().describe("Valfri titel"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Kategori"),
    })),
    execute: async ({ content, title, category }) => {
      const note = await db.note.create({
        data: {
          title: title ?? "",
          content,
          category: category ?? null,
          projectId: null,
          createdById: userId,
        },
      });

      return {
        id: note.id,
        title: note.title,
        content: note.content,
        category: note.category,
        createdAt: note.createdAt.toISOString(),
        message: "Personlig anteckning skapad.",
      };
    },
  });

  const updatePersonalNote = tool({
    description: "Uppdatera en personlig anteckning.",
    inputSchema: toolInputSchema(z.object({
      noteId: z.string().describe("Anteckningens ID"),
      content: z.string().optional().describe("Nytt innehåll"),
      title: z.string().optional().describe("Ny titel"),
      category: z.enum(["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"]).optional()
        .describe("Ny kategori"),
    })),
    execute: async ({ noteId, content, title, category }) => {
      const existing = await db.note.findFirst({
        where: { id: noteId, createdById: userId, projectId: null },
      });
      if (!existing) return { error: "Den personliga anteckningen hittades inte." };

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
        message: "Personlig anteckning uppdaterad.",
      };
    },
  });

  const deletePersonalNote = tool({
    description: "Ta bort en personlig anteckning.",
    inputSchema: toolInputSchema(z.object({
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ noteId }) => {
      const existing = await db.note.findFirst({
        where: { id: noteId, createdById: userId, projectId: null },
      });
      if (!existing) return { error: "Den personliga anteckningen hittades inte." };

      await db.note.delete({ where: { id: noteId } });
      return { success: true, message: "Personlig anteckning borttagen." };
    },
  });

  const searchPersonalNotes = tool({
    description:
      "Sök bland personliga anteckningar. Söker i titel och innehåll.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökord eller fras"),
      limit: z.number().min(1).max(50).optional().default(20),
    })),
    execute: async ({ query, limit = 20 }) => {
      const notes = await db.note.findMany({
        where: {
          createdById: userId,
          projectId: null,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { content: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map((n: typeof notes[number]) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        category: n.category,
        isPinned: n.isPinned,
        createdAt: n.createdAt.toISOString(),
      }));
    },
  });

  // ─── Automations (valfritt projectId) ─────────────────

  const createAutomation = tool({
    description:
      "Skapa en schemalagd automation som kör en åtgärd vid en viss tid eller enligt ett återkommande schema. Ange valfritt projectId om automationen ska gälla ett projekt; annars är den personlig. Använd naturligt språk för schema, t.ex. 'imorgon kl 8', 'om 2 timmar', 'varje dag kl 9'.",
    inputSchema: toolInputSchema(z.object({
      name: z.string().describe("Automationens namn"),
      description: z.string().optional().describe("Valfri beskrivning"),
      schedule: z.string().describe("När den ska köras: 'imorgon kl 8', 'om 2 timmar', 'varje dag kl 9', etc."),
      actionTool: z.string().describe("Verktyg som ska köras: createTask, notify, updateTask, etc."),
      actionParams: z.record(z.string(), z.unknown()).describe("Parametrar till verktyget (objekt med nycklar och värden)"),
      projectId: z.string().optional().describe("Projektets ID om automationen ska gälla ett specifikt projekt"),
    })),
    execute: async ({ name, description, schedule, actionTool, actionParams, projectId: pid }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      const timezone = "Europe/Stockholm";
      const parsed = parseScheduleFromText(schedule, timezone);
      if (!parsed) {
        return { error: "Kunde inte tolka schemat. Använd t.ex. 'imorgon kl 8', 'om 2 timmar', 'varje dag kl 9' eller 'varje måndag kl 8'." };
      }
      const result = await createAutomationAction({
        name,
        description,
        triggerAt: parsed.triggerAt,
        recurrence: parsed.recurrence ?? undefined,
        timezone,
        actionTool,
        actionParams: actionParams as Record<string, unknown>,
        projectId: pid,
      });
      if (!result.success) return { error: result.error };
      return {
        id: result.automation.id,
        name: result.automation.name,
        triggerAt: result.automation.triggerAt,
        recurrence: result.automation.recurrence,
        nextRunAt: result.automation.nextRunAt,
        message: "Automation skapad.",
      };
    },
  });

  const listAutomations = tool({
    description:
      "Lista användarens schemalagda automationer. Ange valfritt projectId för att bara se automationer för ett projekt.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID för att filtrera på ett projekt"),
    })),
    execute: async ({ projectId: pid }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      const result = await listAutomationsAction(pid ? { projectId: pid } : {});
      if (!result.success) return { error: result.error };
      return {
        automations: result.automations.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          triggerAt: a.triggerAt,
          recurrence: a.recurrence,
          actionTool: a.actionTool,
          status: a.status,
          nextRunAt: a.nextRunAt,
          lastRunAt: a.lastRunAt,
          projectId: a.projectId,
        })),
      };
    },
  });

  const deleteAutomation = tool({
    description: "Ta bort en schemalagd automation. Ange automationens ID (från listAutomations).",
    inputSchema: toolInputSchema(z.object({
      automationId: z.string().describe("Automationens ID som ska tas bort"),
    })),
    execute: async ({ automationId }) => {
      const result = await deleteAutomationAction(automationId);
      if (!result.success) return { error: result.error };
      return { success: true, message: "Automation borttagen." };
    },
  });

  return {
    // AIMessages
    getUnreadAIMessages,
    markAIMessageRead,
    sendAIMessageToProject,
    // Projektlista
    getProjectList,
    // Uppgifter
    getUserTasks,
    getProjectTasks,
    createTask,
    updateTask,
    assignTask,
    deleteTask,
    // Kommentarer
    getTaskComments,
    createComment,
    updateComment,
    deleteComment,
    // Tidrapportering
    getProjectTimeEntries,
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getProjectTimeSummary,
    // Filer
    getProjectFiles,
    getPersonalFiles,
    searchFiles,
    analyzeDocument,
    analyzePersonalFile,
    movePersonalFileToProject,
    // Projektmedlemmar
    getProjectMembers,
    // Projektanteckningar
    getProjectNotes,
    createNote: createProjectNote,
    updateNote: updateProjectNote,
    deleteNote: deleteProjectNote,
    searchNotes: searchProjectNotes,
    // Personliga anteckningar
    getPersonalNotes,
    createPersonalNote,
    updatePersonalNote,
    deletePersonalNote,
    searchPersonalNotes,
    createAutomation,
    listAutomations,
    deleteAutomation,
  };
}
