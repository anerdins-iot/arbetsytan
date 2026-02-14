/**
 * Personal AI tools. All use tenantDb(tenantId). Conversation owned by userId.
 * Personlig AI har direkt tillgång till användarens projekt via projectId-parameter.
 */
import { tool, generateText } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import { requireProject, requirePermission } from "@/lib/auth";
import type { TenantScopedClient } from "@/lib/db";
import {
  createProject as createProjectAction,
  updateProject as updateProjectAction,
  archiveProject as archiveProjectAction,
  addProjectMember as addProjectMemberAction,
  removeProjectMember as removeProjectMemberAction,
} from "@/actions/projects";
import {
  createTaskShared,
  updateTaskShared,
  searchDocumentsAcrossProjects,
  parseScheduleFromText,
  generatePdfDocument,
} from "@/lib/ai/tools/shared-tools";
import { getOcrTextForFile, fetchFileFromMinIO } from "@/lib/ai/ocr";
import { analyzeImageWithVision } from "@/lib/ai/file-processors";
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
import { logActivity } from "@/lib/activity-log";
import { notifyProjectStatusChanged } from "@/lib/notification-delivery";
import {
  emitProjectUpdatedToProject,
  emitTimeEntryCreatedToProject,
  emitTimeEntryDeletedToProject,
  emitTimeEntryUpdatedToProject,
  emitNoteCreatedToProject,
  emitNoteUpdatedToProject,
  emitNoteDeletedToProject,
  emitNoteCategoryCreatedToTenant,
  emitNoteCategoryUpdatedToTenant,
  emitNoteCategoryDeletedToTenant,
} from "@/lib/socket";
import { randomUUID } from "node:crypto";
import {
  EMAIL_TEMPLATE_LOCALES,
  EMAIL_TEMPLATE_NAMES,
  EMAIL_TEMPLATE_VARIABLES,
  applyTemplateVariables,
  getDefaultEmailTemplate,
} from "@/lib/email-templates";
import {
  sendExternalEmail as sendExternalEmailAction,
  sendToTeamMembers as sendToTeamMembersAction,
  getTeamMembersForEmail,
  getProjectsWithMembersForEmail,
} from "@/actions/send-email";
import {
  inviteUser as inviteUserAction,
  getInvitations as getInvitationsAction,
  cancelInvitation as cancelInvitationAction,
} from "@/actions/invitations";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/actions/notification-preferences";
import {
  deleteFile as deleteFileAction,
} from "@/actions/files";
import {
  exportTimeReportExcel,
  exportProjectSummaryPdf,
  exportTaskListExcel,
} from "@/actions/export";

export type PersonalToolsContext = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
};

export function createPersonalTools(ctx: PersonalToolsContext) {
  const { db, tenantId, userId } = ctx;

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

  // ─── Projekthantering (Create/Update/Archive) ────────

  const createProject = tool({
    description:
      "Skapa ett nytt projekt. Kräver att användaren har behörighet att skapa projekt. Ange namn, valfritt beskrivning och adress.",
    inputSchema: toolInputSchema(z.object({
      name: z.string().min(1).max(200).describe("Projektets namn"),
      description: z.string().max(2000).optional().describe("Beskrivning av projektet"),
      address: z.string().max(500).optional().describe("Projektets adress"),
    })),
    execute: async ({ name, description, address }) => {
      await requirePermission("canCreateProject");

      const formData = new FormData();
      formData.append("name", name);
      if (description) formData.append("description", description);
      if (address) formData.append("address", address);

      const result = await createProjectAction(formData);

      if (!result.success || !result.project) {
        return { error: result.error || "Kunde inte skapa projektet." };
      }

      const project = result.project;

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        address: project.address,
        message: `Projektet "${project.name}" har skapats.`,
      };
    },
  });

  const updateProject = tool({
    description:
      "Uppdatera projektinformation. Kräver projectId. Ange de fält som ska ändras: namn, beskrivning, status eller adress.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      name: z.string().min(1).max(200).optional().describe("Nytt namn"),
      description: z.string().max(2000).optional().nullable().describe("Ny beskrivning"),
      status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional().describe("Ny status (använd archiveProject för att arkivera)"),
      address: z.string().max(500).optional().nullable().describe("Ny adress"),
    })),
    execute: async ({ projectId: pid, name, description, status, address }) => {
      await requirePermission("canUpdateProject");
      const currentProject = await requireProject(tenantId, pid, userId);

      const formData = new FormData();
      formData.append("name", name ?? currentProject.name);
      if (description !== undefined) {
        formData.append("description", description ?? "");
      } else if (currentProject.description) {
        formData.append("description", currentProject.description);
      }
      if (address !== undefined) {
        formData.append("address", address ?? "");
      } else if (currentProject.address) {
        formData.append("address", currentProject.address);
      }
      formData.append("status", status ?? currentProject.status);

      const result = await updateProjectAction(pid, formData);

      if (!result.success || !result.project) {
        return { error: result.error || "Kunde inte uppdatera projektet." };
      }

      const updated = result.project;
      const statusChanged = status !== undefined && currentProject.status !== status;

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        address: updated.address,
        message: statusChanged
          ? `Projektet "${updated.name}" har uppdaterats. Status ändrad från ${currentProject.status} till ${status}.`
          : `Projektet "${updated.name}" har uppdaterats.`,
      };
    },
  });

  const archiveProject = tool({
    description:
      "Arkivera ett projekt. Sätter projektets status till ARCHIVED. Kan inte ångras via detta verktyg — använd updateProject för att ändra tillbaka.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("ID för projektet som ska arkiveras"),
      confirmArchive: z.boolean().describe("Måste vara true för att bekräfta arkivering"),
    })),
    execute: async ({ projectId: pid, confirmArchive }) => {
      if (!confirmArchive) {
        return { error: "Arkivering avbröts: confirmArchive måste vara true." };
      }

      await requirePermission("canUpdateProject");
      const result = await archiveProjectAction(pid);

      if (!result.success || !result.project) {
        return { error: result.error || "Kunde inte arkivera projektet." };
      }

      const updated = result.project;

      return {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        message: `Projektet "${updated.name}" har arkiverats.`,
      };
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
      "Tilldela en uppgift till en projektmedlem. Kräver projectId, taskId och membershipId (från listMembers).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
      membershipId: z.string().describe("MembershipId för den som ska tilldelas (från listMembers)"),
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

      emitTimeEntryCreatedToProject(pid, {
        projectId: pid,
        timeEntryId: created.id,
        actorUserId: userId,
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

      emitTimeEntryUpdatedToProject(pid, {
        projectId: pid,
        timeEntryId: updated.id,
        actorUserId: userId,
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

      emitTimeEntryDeletedToProject(pid, {
        projectId: pid,
        timeEntryId: existing.id,
        actorUserId: userId,
      });

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

  const exportTimeReport = tool({
    description: "Exportera en tidsrapport för ett projekt som Excel eller PDF. Returnerar en nedladdningslänk.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      format: z.enum(["excel", "pdf"]).describe("Filformat: 'excel' eller 'pdf'"),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Startdatum YYYY-MM-DD (valfritt, endast för excel)"),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Slutdatum YYYY-MM-DD (valfritt, endast för excel)"),
      targetUserId: z.string().optional().describe("Filtrera på specifik användare (valfritt, endast för excel)"),
    })),
    execute: async ({ projectId: pid, format, fromDate, toDate, targetUserId }) => {
      await requireProject(tenantId, pid, userId);

      if (format === "excel") {
        const result = await exportTimeReportExcel(pid, { fromDate, toDate, userId: targetUserId });
        if (!result.success) return { error: result.error };
        return {
          downloadUrl: result.downloadUrl,
          message: `Tidsrapporten (Excel) har genererats. Du kan ladda ner den här: ${result.downloadUrl}`,
        };
      } else {
        const result = await exportProjectSummaryPdf(pid);
        if (!result.success) return { error: result.error };
        return {
          downloadUrl: result.downloadUrl,
          message: `Projektsammanställningen (PDF) som inkluderar tidsrapportering har genererats. Du kan ladda ner den här: ${result.downloadUrl}`,
        };
      }
    },
  });

  const exportTaskList = tool({
    description: "Exportera en lista över alla uppgifter i ett projekt som en Excel-fil.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
    })),
    execute: async ({ projectId: pid }) => {
      await requireProject(tenantId, pid, userId);
      const result = await exportTaskListExcel(pid);
      if (!result.success) return { error: result.error };
      return {
        downloadUrl: result.downloadUrl,
        message: `Uppgiftslistan (Excel) har genererats. Du kan ladda ner den här: ${result.downloadUrl}`,
      };
    },
  });

  // ─── Projektrapport ────────────────────────────────────

  const generateProjectReport = tool({
    description:
      "Generera en projektrapport (PDF) för ett projekt. Hämtar uppgifter, tidsrapporter och medlemmar, skapar en AI-sammanfattning och sparar som PDF i projektets fillista. Kräver OPENAI_API_KEY.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      reportType: z.enum(["weekly", "monthly", "custom"]).describe("Typ av rapport: weekly (senaste 7 dagar), monthly (senaste 30 dagar), custom (använd dateRange)"),
      dateRange: z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Startdatum YYYY-MM-DD"),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Slutdatum YYYY-MM-DD"),
      }).optional().describe("Valfritt datumintervall för reportType custom"),
    })),
    execute: async ({ projectId: pid, reportType, dateRange }) => {
      const project = await requireProject(tenantId, pid, userId);

      if (!process.env.OPENAI_API_KEY) {
        return { error: "Rapportgenerering kräver OPENAI_API_KEY. Kontakta administratören." };
      }

      const now = new Date();
      const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let fromDate: Date;
      if (reportType === "weekly") {
        fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 7);
      } else if (reportType === "monthly") {
        fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 30);
      } else {
        if (dateRange?.start && dateRange?.end) {
          fromDate = new Date(dateRange.start);
          toDate.setTime(new Date(dateRange.end).getTime());
        } else {
          fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - 30);
        }
      }

      const tasks = await db.task.findMany({
        where: { projectId: pid },
        select: { id: true, title: true, status: true, priority: true, deadline: true },
        orderBy: [{ status: "asc" }, { deadline: "asc" }],
      });

      const timeEntries = await db.timeEntry.findMany({
        where: {
          projectId: pid,
          date: { gte: fromDate, lte: toDate },
        },
        include: { task: { select: { id: true, title: true } } },
        orderBy: { date: "desc" },
      });

      const userIds = [...new Set(timeEntries.map((e) => e.userId))];
      const { prisma } = await import("@/lib/db");
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      const members = await db.projectMember.findMany({
        where: { projectId: pid },
        include: {
          membership: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });

      const timeSummary = timeEntries.reduce((sum, e) => sum + e.minutes, 0);
      const dataForAi = {
        projectName: project.name,
        reportType,
        period: { from: fromDate.toISOString().split("T")[0], to: toDate.toISOString().split("T")[0] },
        tasks: tasks.map((t) => ({
          title: t.title,
          status: t.status,
          priority: t.priority,
          deadline: t.deadline?.toISOString().split("T")[0] ?? null,
        })),
        timeEntriesSummary: {
          totalMinutes: timeSummary,
          totalHours: Math.floor(timeSummary / 60),
          entries: timeEntries.slice(0, 50).map((e) => {
            const u = userMap.get(e.userId);
            return {
              date: e.date.toISOString().split("T")[0],
              task: e.task?.title ?? null,
              minutes: e.minutes,
              user: u ? (u.name ?? u.email) : "Okänd",
            };
          }),
        },
        members: members.map((m) => ({
          name: m.membership.user.name ?? m.membership.user.email,
          email: m.membership.user.email,
        })),
      };

      const prompt = `Skriv en kort projektrapport på svenska baserat på följande data. Använd stycken med rubriker som "Översikt", "Uppgifter", "Tidsrapportering", "Medlemmar". Var koncis och professionell. Data (JSON):\n${JSON.stringify(dataForAi, null, 2)}`;

      let summary: string;
      try {
        const result = await generateText({
          model: openai("gpt-4o"),
          prompt,
          maxOutputTokens: 2000,
        });
        summary = result.text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Kunde inte generera rapporttext: ${msg}` };
      }

      const periodLabel = `${fromDate.toISOString().split("T")[0]}-${toDate.toISOString().split("T")[0]}`;
      const fileName = `projektrapport-${reportType}-${periodLabel}.pdf`;
      const pdfResult = await generatePdfDocument({
        db,
        tenantId,
        projectId: pid,
        userId,
        fileName,
        title: `Projektrapport: ${project.name} (${reportType})`,
        content: summary,
      });

      if ("error" in pdfResult) {
        return { error: pdfResult.error };
      }

      return {
        fileId: pdfResult.fileId,
        name: pdfResult.name,
        message: `Rapporten "${pdfResult.name}" har sparats i projektets fillista.`,
      };
    },
  });

  // ─── Filer (Files) ────────────────────────────────────

  const listFiles = tool({
    description: "Lista filer i ett projekt (id, namn, typ, storlek, datum).",
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

  const deleteFile = tool({
    description: "Radera en fil från ett projekt permanent. Kräver projectId och fileId. VIKTIGT: Kan inte ångras.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      fileId: z.string().describe("Filens ID"),
      confirmDeletion: z.boolean().describe("Måste vara true för att bekräfta permanent borttagning"),
    })),
    execute: async ({ projectId: pid, fileId, confirmDeletion }) => {
      if (!confirmDeletion) {
        return { error: "Radering avbröts: confirmDeletion måste vara true." };
      }

      const result = await deleteFileAction({ projectId: pid, fileId });

      if (!result.success) {
        return { error: result.error || "Kunde inte radera filen." };
      }

      return { success: true, message: "Filen har raderats permanent." };
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
      "ANVÄND DETTA VERKTYG när användaren frågar om dokument, filer, ritningar, eller specifikt innehåll (t.ex. 'U20', 'gruppförteckning', 'faktura'). Söker i alla projekt användaren har tillgång till PLUS personliga filer. Semantisk sökning i OCR-text från PDF:er och ritningar. Returnerar matchande dokument med projektnamn och relevanta utdrag.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökfråga eller nyckelord att söka efter i dokumentens innehåll"),
      limit: z.number().min(1).max(15).optional().default(8),
    })),
    execute: async ({ query, limit }) => {
      const projectIds = (
        await db.projectMember.findMany({
          where: { membership: { userId } },
          select: { projectId: true },
        })
      ).map((p) => p.projectId);

      const searchResult = await searchDocumentsAcrossProjects({ tenantId, projectIds, query, limit, userId });

      // If no results, provide helpful feedback
      if (searchResult.results.length === 0) {
        // Check if there are any files with OCR text at all
        const fileCount = await db.file.count({
          where: {
            OR: [
              { projectId: { in: projectIds.length > 0 ? projectIds : ["__none__"] } },
              { projectId: null, uploadedById: userId },
            ],
            ocrText: { not: null },
          },
        });

        if (fileCount === 0) {
          return {
            __searchResults: true as const,
            results: [],
            message: "Inga dokument med sökbar text hittades. Filer måste ha OCR-text för att kunna sökas.",
          };
        }

        return {
          __searchResults: true as const,
          results: [],
          message: `Inga dokument matchade sökningen "${query}". Prova andra sökord eller använd getProjectFiles för att lista filer i ett specifikt projekt.`,
        };
      }

      return searchResult;
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

  const analyzeImage = tool({
    description:
      "Analysera en bild med AI-vision (Claude). Använd detta för att beskriva vad som syns på bilden - objekt, personer, scener, färger etc. Fungerar både för projektfiler och personliga filer. OCR-text (om den finns) skickas med som kontext för bättre analys.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("ID för bildfilen"),
      projectId: z.string().optional().describe("Projektets ID om det är en projektfil (utelämna för personliga filer)"),
      question: z.string().optional().describe("Specifik fråga om bilden, t.ex. 'Vad är det för djur på bilden?'"),
    })),
    execute: async ({ fileId, projectId: pid, question }) => {
      // Hämta fil - antingen från projekt eller personliga filer
      let file;
      if (pid) {
        await requireProject(tenantId, pid, userId);
        file = await db.file.findFirst({
          where: { id: fileId, projectId: pid },
          select: { id: true, name: true, type: true, bucket: true, key: true, ocrText: true },
        });
      } else {
        file = await db.file.findFirst({
          where: { id: fileId, projectId: null, uploadedById: userId },
          select: { id: true, name: true, type: true, bucket: true, key: true, ocrText: true },
        });
      }

      if (!file) {
        return { error: "Filen hittades inte eller du har inte behörighet." };
      }

      // Kontrollera att det är en bild
      if (!file.type.startsWith("image/")) {
        return { error: "Filen är inte en bild. Använd analyzeDocument för PDF:er och andra dokument." };
      }

      // Hämta bilden från MinIO
      let buffer: Buffer;
      try {
        buffer = await fetchFileFromMinIO(file.bucket, file.key);
      } catch (err) {
        return { error: `Kunde inte hämta filen: ${err instanceof Error ? err.message : String(err)}` };
      }

      // Analysera med Claude vision
      const analysis = await analyzeImageWithVision(buffer, file.type, file.ocrText, question);

      return {
        fileName: file.name,
        analysis,
        ocrText: file.ocrText || null,
        message: "Bildanalys klar.",
      };
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

  const listMembers = tool({
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

  const getAvailableMembers = tool({
    description: "Hämta en lista över teammedlemmar i företaget som kan läggas till i projektet.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
    })),
    execute: async ({ projectId: pid }) => {
      await requireProject(tenantId, pid, userId);
      
      // Hämta alla medlemmar i tenanten
      const allMemberships = await db.membership.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      // Hämta befintliga projektmedlemmar
      const existingMembers = await db.projectMember.findMany({
        where: { projectId: pid },
        select: { membershipId: true },
      });
      const existingIds = new Set(existingMembers.map(m => m.membershipId));

      // Filtrera ut de som redan är med i projektet
      return allMemberships
        .filter(m => !existingIds.has(m.id))
        .map((m) => ({
          membershipId: m.id,
          userName: m.user.name ?? m.user.email,
          email: m.user.email,
        }));
    },
  });

  const addMember = tool({
    description: "Lägg till en teammedlem i ett projekt. Kräver projectId och membershipId (från getAvailableMembers).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      membershipId: z.string().describe("Medlemmens membershipId"),
    })),
    execute: async ({ projectId: pid, membershipId }) => {
      await requirePermission("canManageTeam");
      const result = await addProjectMemberAction(pid, membershipId);
      if (!result.success) return { error: result.error || "Kunde inte lägga till medlemmen." };
      return { success: true, message: "Medlemmen har lagts till i projektet." };
    },
  });

  const removeMember = tool({
    description: "Ta bort en medlem från ett projekt. Kräver projectId och membershipId (från listMembers).",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      membershipId: z.string().describe("Medlemmens membershipId"),
    })),
    execute: async ({ projectId: pid, membershipId }) => {
      await requirePermission("canManageTeam");
      const result = await removeProjectMemberAction(pid, membershipId);
      if (!result.success) return { error: result.error || "Kunde inte ta bort medlemmen." };
      return { success: true, message: "Medlemmen har tagits bort från projektet." };
    },
  });

  // ─── Inbjudningar (Invitations) ───────────────────────

  const sendInvitation = tool({
    description: "Skicka en inbjudan till en ny användare via e-post. Endast admins kan skicka inbjudningar.",
    inputSchema: toolInputSchema(z.object({
      email: z.string().email().describe("E-postadress till den som ska bjudas in"),
      role: z.enum(["ADMIN", "PROJECT_MANAGER", "WORKER"]).describe("Roll för den nya användaren"),
    })),
    execute: async ({ email, role }) => {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("role", role);

      const result = await inviteUserAction(formData);

      if (!result.success) {
        if (result.error === "FORBIDDEN") {
          return { error: "Du har inte behörighet att skicka inbjudningar." };
        }
        if (result.error === "ALREADY_MEMBER") {
          return { error: `Användaren med e-post ${email} är redan medlem i företaget.` };
        }
        if (result.error === "ALREADY_INVITED") {
          return { error: `En inbjudan har redan skickats till ${email} och väntar på svar.` };
        }
        return { error: result.error || "Kunde inte skicka inbjudan." };
      }

      return {
        success: true,
        message: `En inbjudan har skickats till ${email} med rollen ${role}.`,
      };
    },
  });

  const listInvitations = tool({
    description: "Lista alla skickade inbjudningar och deras status (ADMIN).",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      try {
        const invitations = await getInvitationsAction();
        return { invitations };
      } catch (err) {
        return { error: "Du har inte behörighet att lista inbjudningar eller så uppstod ett fel." };
      }
    },
  });

  const cancelInvitation = tool({
    description: "Avbryt/ta bort en skickad inbjudan som inte har accepterats än (ADMIN).",
    inputSchema: toolInputSchema(z.object({
      invitationId: z.string().describe("ID för inbjudan som ska avbrytas"),
    })),
    execute: async ({ invitationId }) => {
      const formData = new FormData();
      formData.append("invitationId", invitationId);

      const result = await cancelInvitationAction(formData);

      if (!result.success) {
        return { error: result.error || "Kunde inte avbryta inbjudan." };
      }

      return {
        success: true,
        message: "Inbjudan har avbrutits och tagits bort.",
      };
    },
  });

  // ─── Projektanteckningar (Notes) ──────────────────────

  const getProjectNotes = tool({
    description:
      "Hämta anteckningar från ett projekt. Kan filtrera på kategori.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      category: z.string().optional()
        .describe("Filtrera på kategori (slug)"),
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
      category: z.string().optional()
        .describe("Kategori (slug)"),
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

      emitNoteCreatedToProject(pid, {
        noteId: note.id,
        projectId: pid,
        title: note.title,
        category: note.category,
        createdById: userId,
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
      category: z.string().optional()
        .describe("Ny kategori (slug)"),
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
        include: { createdBy: { select: { id: true, name: true, email: true } } },
      });

      emitNoteUpdatedToProject(pid, {
        noteId: note.id,
        projectId: pid,
        title: note.title,
        category: note.category,
        createdById: note.createdBy.id,
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

      emitNoteDeletedToProject(pid, {
        noteId,
        projectId: pid,
        title: existing.title,
        category: existing.category,
        createdById: existing.createdById,
      });

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
      category: z.string().optional()
        .describe("Filtrera på kategori (slug)"),
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
      category: z.string().optional()
        .describe("Kategori (slug)"),
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
      category: z.string().optional()
        .describe("Ny kategori (slug)"),
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

  const ensureAdmin = async () => {
    const adminMembership = await db.membership.findFirst({
      where: { userId, role: "ADMIN" },
      select: { id: true },
    });
    if (!adminMembership) {
      return { error: "Endast admins kan hantera e-postmallar." };
    }
    return null;
  };

  // ─── Email templates (Admin only) ─────────────────────

  const listEmailTemplates = tool({
    description:
      "Lista alla e-postmallar (sv/en) med ämnesrad, variabler och om mallen är anpassad eller standard.",
    inputSchema: toolInputSchema(
      z.object({
        _: z.string().optional().describe("Ignored"),
      })
    ),
    execute: async () => {
      const adminError = await ensureAdmin();
      if (adminError) return adminError;

      const customRows = await db.emailTemplate.findMany({
        select: {
          name: true,
          locale: true,
          subject: true,
          htmlTemplate: true,
        },
      });

      const customMap = new Map<string, { subject: string }>();
      for (const row of customRows as Array<{
        name: string;
        locale: string;
        subject: string;
      }>) {
        customMap.set(`${row.name}:${row.locale}`, { subject: row.subject });
      }

      const templates: Array<{
        name: string;
        locale: string;
        subject: string;
        variables: string[];
        isCustom: boolean;
      }> = [];

      for (const name of EMAIL_TEMPLATE_NAMES) {
        for (const locale of EMAIL_TEMPLATE_LOCALES) {
          const custom = customMap.get(`${name}:${locale}`);
          const fallback = getDefaultEmailTemplate(name, locale);
          if (!fallback) continue;
          templates.push({
            name,
            locale,
            subject: custom?.subject ?? fallback.subject,
            variables: EMAIL_TEMPLATE_VARIABLES[name],
            isCustom: Boolean(custom),
          });
        }
      }

      return { templates };
    },
  });

  const getEmailTemplate = tool({
    description:
      "Hämta en specifik e-postmall med subject, HTML och tillgängliga variabler. Kräver name och locale (sv/en).",
    inputSchema: toolInputSchema(
      z.object({
        name: z.enum(EMAIL_TEMPLATE_NAMES),
        locale: z.enum(EMAIL_TEMPLATE_LOCALES),
      })
    ),
    execute: async ({ name, locale }) => {
      const adminError = await ensureAdmin();
      if (adminError) return adminError;

      const custom = await db.emailTemplate.findFirst({
        where: { name, locale },
        select: { subject: true, htmlTemplate: true },
      });
      const fallback = getDefaultEmailTemplate(name, locale);

      if (!fallback) {
        return { error: `Template ${name} (${locale}) not found` };
      }

      return {
        name,
        locale,
        subject: custom?.subject ?? fallback.subject,
        htmlTemplate: custom?.htmlTemplate ?? fallback.htmlTemplate,
        variables: EMAIL_TEMPLATE_VARIABLES[name],
        isCustom: Boolean(custom),
      };
    },
  });

  const updateEmailTemplate = tool({
    description:
      "Uppdatera en e-postmall för tenanten. Ange name, locale, subject och htmlTemplate. Endast admins.",
    inputSchema: toolInputSchema(
      z.object({
        name: z.enum(EMAIL_TEMPLATE_NAMES),
        locale: z.enum(EMAIL_TEMPLATE_LOCALES),
        subject: z.string().min(1).max(300),
        htmlTemplate: z.string().min(1).max(100000),
      })
    ),
    execute: async ({ name, locale, subject, htmlTemplate }) => {
      const adminError = await ensureAdmin();
      if (adminError) return adminError;

      await db.emailTemplate.upsert({
        where: {
          tenantId_name_locale: {
            tenantId,
            name,
            locale,
          },
        },
        update: {
          subject,
          htmlTemplate,
          variables: EMAIL_TEMPLATE_VARIABLES[name],
        },
        create: {
          tenantId,
          name,
          locale,
          subject,
          htmlTemplate,
          variables: EMAIL_TEMPLATE_VARIABLES[name],
        },
      });

      return {
        success: true,
        message: "E-postmallen har uppdaterats.",
      };
    },
  });

  const previewEmailTemplate = tool({
    description:
      "Förhandsgranska en e-postmall med testdata. Returnerar renderad subject och HTML. Endast admins.",
    inputSchema: toolInputSchema(
      z.object({
        name: z.enum(EMAIL_TEMPLATE_NAMES),
        locale: z.enum(EMAIL_TEMPLATE_LOCALES),
        testData: z.record(z.string(), z.string()).optional(),
      })
    ),
    execute: async ({ name, locale, testData }) => {
      const adminError = await ensureAdmin();
      if (adminError) return adminError;

      const custom = await db.emailTemplate.findFirst({
        where: { name, locale },
        select: { subject: true, htmlTemplate: true },
      });
      const fallback = getDefaultEmailTemplate(name, locale);

      if (!fallback) {
        return { error: `Template ${name} (${locale}) not found` };
      }

      const template = {
        subject: custom?.subject ?? fallback.subject,
        htmlTemplate: custom?.htmlTemplate ?? fallback.htmlTemplate,
      };

      const defaultTestData: Record<string, string> = {
        appName: "ArbetsYtan",
        projectName: "Demo Project",
        projectUrl: "https://app.arbetsytan.se/sv/projects/demo",
        taskTitle: "Test task",
        assignedBy: "Projektledare",
        deadline: "2026-02-20 10:00",
        previousStatus: "ACTIVE",
        newStatus: "PAUSED",
        inviteUrl: "https://app.arbetsytan.se/sv/invite/demo",
        tenantName: "Demo AB",
        inviterName: "Admin User",
        resetUrl: "https://app.arbetsytan.se/sv/reset-password?token=demo",
        supportEmail: "support@arbetsytan.se",
      };

      const variables = { ...defaultTestData, ...(testData ?? {}) };

      return {
        subject: applyTemplateVariables(template.subject, variables),
        html: applyTemplateVariables(template.htmlTemplate, variables),
        variablesUsed: EMAIL_TEMPLATE_VARIABLES[name],
      };
    },
  });

  // ─── Skicka e-post ──────────────────────────────────────

  const prepareEmailToExternalRecipients = tool({
    description:
      "Förbered e-post till externa mottagare. Returnerar en förhandsgranskning som visas för användaren med en skicka-knapp. Mailet skickas INTE förrän användaren klickar på knappen. Kan bifoga filer från användarens personliga lagring eller projektfiler.",
    inputSchema: toolInputSchema(
      z.object({
        recipients: z
          .array(z.string().email())
          .min(1)
          .describe("Lista med e-postadresser"),
        subject: z.string().min(1).max(300).describe("Ämnesrad"),
        body: z.string().min(1).max(50000).describe("Meddelandetext (klartext, blir HTML-formaterad)"),
        replyTo: z.string().email().optional().describe("Svara-till adress"),
        attachments: z
          .array(
            z.object({
              fileId: z.string().describe("Fil-ID från personlig lagring eller projekt"),
              fileName: z.string().describe("Filnamn som visas"),
              source: z.enum(["personal", "project"]).describe("Källa: personal eller project"),
              projectId: z.string().optional().describe("Projekt-ID om source är project"),
            })
          )
          .optional()
          .describe("Filer att bifoga"),
      })
    ),
    execute: async ({ recipients, subject, body, replyTo, attachments }) => {
      // Return special format that the chat UI will render as EmailPreviewCard
      return {
        __emailPreview: true,
        type: "external" as const,
        recipients,
        subject,
        body,
        replyTo,
        attachments: attachments ?? [],
        message: `E-post förberedd för ${recipients.length} mottagare${attachments?.length ? ` med ${attachments.length} bifogade filer` : ""}. Användaren måste klicka på "Skicka"-knappen för att skicka.`,
      };
    },
  });

  const prepareEmailToTeamMembers = tool({
    description:
      "Förbered e-post till teammedlemmar. Returnerar en förhandsgranskning som visas för användaren med en skicka-knapp. Mailet skickas INTE förrän användaren klickar på knappen. Använd getTeamMembersForEmail först för att se tillgängliga medlemmar. Kan bifoga filer.",
    inputSchema: toolInputSchema(
      z.object({
        memberIds: z
          .array(z.string())
          .min(1)
          .describe("Lista med användar-ID:n (från getTeamMembersForEmail)"),
        memberEmails: z
          .array(z.string())
          .optional()
          .describe("E-postadresser för visning (valfritt)"),
        subject: z.string().min(1).max(300).describe("Ämnesrad"),
        body: z.string().min(1).max(50000).describe("Meddelandetext (klartext)"),
        attachments: z
          .array(
            z.object({
              fileId: z.string().describe("Fil-ID från personlig lagring eller projekt"),
              fileName: z.string().describe("Filnamn som visas"),
              source: z.enum(["personal", "project"]).describe("Källa: personal eller project"),
              projectId: z.string().optional().describe("Projekt-ID om source är project"),
            })
          )
          .optional()
          .describe("Filer att bifoga"),
      })
    ),
    execute: async ({ memberIds, memberEmails, subject, body, attachments }) => {
      // Return special format that the chat UI will render as EmailPreviewCard
      return {
        __emailPreview: true,
        type: "team" as const,
        memberIds,
        recipients: memberEmails ?? memberIds,
        subject,
        body,
        attachments: attachments ?? [],
        message: `E-post förberedd för ${memberIds.length} teammedlem(mar)${attachments?.length ? ` med ${attachments.length} bifogade filer` : ""}. Användaren måste klicka på "Skicka"-knappen för att skicka.`,
      };
    },
  });

  const getTeamMembersForEmailTool = tool({
    description:
      "Hämta lista över ALLA teammedlemmar i företaget som kan ta emot e-post. Använd detta för att skicka till hela företaget. Returnerar id, namn, e-post och roll.",
    inputSchema: toolInputSchema(z.object({})),
    execute: async () => {
      const members = await getTeamMembersForEmail();
      return {
        members,
        hint: "Dessa är alla medlemmar i företaget. Använd prepareEmailToTeamMembers för att skicka till dem.",
      };
    },
  });

  const getProjectsForEmailTool = tool({
    description:
      "Hämta lista över projekt som användaren har tillgång till, med antal medlemmar per projekt. Använd detta för att välja projekt innan du hämtar projektmedlemmar.",
    inputSchema: toolInputSchema(z.object({})),
    execute: async () => {
      const projects = await getProjectsWithMembersForEmail();
      return {
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          memberCount: p.members.length,
        })),
        hint: "Använd getProjectMembersForEmailTool med ett projektId för att se medlemmarna.",
      };
    },
  });

  // ─── Notifikationsinställningar (egna) ─────────────────

  const getNotificationSettings = tool({
    description:
      "Hämta användarens notifikationsinställningar: push-notiser och e-post för tilldelade uppgifter, deadline imorgon och projektstatusändringar.",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      const result = await getNotificationPreferences();
      if (!result.success || !result.preferences) {
        return { error: "Kunde inte hämta notifikationsinställningar." };
      }
      return {
        pushEnabled: result.preferences.pushEnabled,
        emailTaskAssigned: result.preferences.emailTaskAssigned,
        emailDeadlineTomorrow: result.preferences.emailDeadlineTomorrow,
        emailProjectStatusChanged: result.preferences.emailProjectStatusChanged,
      };
    },
  });

  const updateNotificationSettings = tool({
    description:
      "Uppdatera användarens notifikationsinställningar. Slå på eller av push-notiser och e-post för tilldelade uppgifter, deadline imorgon och projektstatusändringar. Ange endast de fält som ska ändras; övriga behålls.",
    inputSchema: toolInputSchema(z.object({
      pushEnabled: z.boolean().optional().describe("Push-notiser på enheten (på/av)"),
      emailTaskAssigned: z.boolean().optional().describe("E-post när användaren tilldelas en uppgift"),
      emailDeadlineTomorrow: z.boolean().optional().describe("E-post när deadline är imorgon"),
      emailProjectStatusChanged: z.boolean().optional().describe("E-post vid projektstatusändring"),
    })),
    execute: async (input) => {
      const current = await getNotificationPreferences();
      if (!current.success || !current.preferences) {
        return { error: "Kunde inte hämta nuvarande inställningar." };
      }
      const merged = {
        pushEnabled: input.pushEnabled ?? current.preferences.pushEnabled,
        emailTaskAssigned: input.emailTaskAssigned ?? current.preferences.emailTaskAssigned,
        emailDeadlineTomorrow: input.emailDeadlineTomorrow ?? current.preferences.emailDeadlineTomorrow,
        emailProjectStatusChanged: input.emailProjectStatusChanged ?? current.preferences.emailProjectStatusChanged,
      };
      const result = await updateNotificationPreferences(merged);
      if (!result.success) {
        return { error: result.error ?? "Kunde inte uppdatera notifikationsinställningar." };
      }
      return {
        success: true,
        message: "Notifikationsinställningar har uppdaterats.",
        pushEnabled: merged.pushEnabled,
        emailTaskAssigned: merged.emailTaskAssigned,
        emailDeadlineTomorrow: merged.emailDeadlineTomorrow,
        emailProjectStatusChanged: merged.emailProjectStatusChanged,
      };
    },
  });

  const getProjectMembersForEmailTool = tool({
    description:
      "Hämta medlemmar i ett SPECIFIKT projekt som kan ta emot e-post. Kräver projectId. Returnerar userId, namn, e-post och roll för varje projektmedlem.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
    })),
    execute: async ({ projectId: pid }) => {
      await requireProject(tenantId, pid, userId);
      const projects = await getProjectsWithMembersForEmail();
      const project = projects.find(p => p.id === pid);
      if (!project) {
        return { error: "Projektet hittades inte eller du har inte behörighet." };
      }
      return {
        projectId: project.id,
        projectName: project.name,
        members: project.members.map(m => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
        })),
        hint: "Använd prepareEmailToProjectMembers för att skicka e-post till dessa medlemmar.",
      };
    },
  });

  const prepareEmailToProjectMembers = tool({
    description:
      "Förbered e-post till projektmedlemmar. Returnerar en förhandsgranskning som visas för användaren med en skicka-knapp. Mailet skickas INTE förrän användaren klickar på knappen. Använd getProjectMembersForEmailTool först för att se medlemmar i projektet.",
    inputSchema: toolInputSchema(
      z.object({
        projectId: z.string().describe("Projektets ID"),
        memberIds: z
          .array(z.string())
          .optional()
          .describe("Lista med användar-ID:n. Om tom skickas till ALLA projektmedlemmar."),
        subject: z.string().min(1).max(300).describe("Ämnesrad"),
        body: z.string().min(1).max(50000).describe("Meddelandetext (klartext)"),
        attachments: z
          .array(
            z.object({
              fileId: z.string().describe("Fil-ID från personlig lagring eller projekt"),
              fileName: z.string().describe("Filnamn som visas"),
              source: z.enum(["personal", "project"]).describe("Källa: personal eller project"),
              projectId: z.string().optional().describe("Projekt-ID om source är project"),
            })
          )
          .optional()
          .describe("Filer att bifoga"),
      })
    ),
    execute: async ({ projectId: pid, memberIds, subject, body, attachments }) => {
      await requireProject(tenantId, pid, userId);
      const projects = await getProjectsWithMembersForEmail();
      const project = projects.find(p => p.id === pid);
      if (!project) {
        return { error: "Projektet hittades inte." };
      }

      // Om memberIds inte anges, skicka till alla projektmedlemmar
      const targetMembers = memberIds && memberIds.length > 0
        ? project.members.filter(m => memberIds.includes(m.userId))
        : project.members;

      if (targetMembers.length === 0) {
        return { error: "Inga medlemmar valda eller hittades i projektet." };
      }

      // Return special format that the chat UI will render as EmailPreviewCard
      return {
        __emailPreview: true,
        type: "project" as const,
        projectId: pid,
        projectName: project.name,
        memberIds: targetMembers.map(m => m.userId),
        recipients: targetMembers.map(m => m.email),
        recipientNames: targetMembers.map(m => m.name),
        subject,
        body,
        attachments: attachments ?? [],
        message: `E-post förberedd för ${targetMembers.length} projektmedlem(mar) i "${project.name}"${attachments?.length ? ` med ${attachments.length} bifogade filer` : ""}. Användaren måste klicka på "Skicka"-knappen för att skicka.`,
      };
    },
  });

  // ─── Anteckningskategorier (NoteCategory) ────────────

  const listNoteCategories = tool({
    description:
      "Hämta alla anteckningskategorier för tenanten.",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      const categories = await db.noteCategory.findMany({
        orderBy: { name: "asc" },
      });
      return categories.map((c: typeof categories[number]) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color,
      }));
    },
  });

  const createNoteCategory = tool({
    description:
      "Skapa en ny anteckningskategori. Slug genereras automatiskt från namnet.",
    inputSchema: toolInputSchema(z.object({
      name: z.string().min(1).max(50).describe("Kategorins namn"),
      color: z.string().optional().describe("Hex-färg, t.ex. #3b82f6"),
    })),
    execute: async ({ name, color }) => {
      const slug = name
        .toLowerCase()
        .replace(/[åä]/g, "a")
        .replace(/ö/g, "o")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

      const existing = await db.noteCategory.findFirst({
        where: { slug },
      });
      if (existing) return { error: `Kategori med slug "${slug}" finns redan.` };

      const category = await db.noteCategory.create({
        data: { name, slug, color: color ?? null, tenantId },
      });

      emitNoteCategoryCreatedToTenant(tenantId, {
        categoryId: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
      });

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
        message: "Kategori skapad.",
      };
    },
  });

  const updateNoteCategory = tool({
    description: "Uppdatera en anteckningskategori.",
    inputSchema: toolInputSchema(z.object({
      categoryId: z.string().describe("Kategorins ID"),
      name: z.string().min(1).max(50).optional().describe("Nytt namn"),
      color: z.string().optional().nullable().describe("Ny hex-färg eller null för att ta bort"),
    })),
    execute: async ({ categoryId, name, color }) => {
      const existing = await db.noteCategory.findFirst({
        where: { id: categoryId },
      });
      if (!existing) return { error: "Kategorin hittades inte." };

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) {
        updateData.name = name;
        updateData.slug = name
          .toLowerCase()
          .replace(/[åä]/g, "a")
          .replace(/ö/g, "o")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
      }
      if (color !== undefined) updateData.color = color;

      const category = await db.noteCategory.update({
        where: { id: categoryId },
        data: updateData,
      });

      emitNoteCategoryUpdatedToTenant(tenantId, {
        categoryId: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
      });

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
        message: "Kategori uppdaterad.",
      };
    },
  });

  const deleteNoteCategory = tool({
    description: "Ta bort en anteckningskategori. Anteckningar med denna kategori behåller sin kategori-text men kategorin försvinner från listan.",
    inputSchema: toolInputSchema(z.object({
      categoryId: z.string().describe("Kategorins ID"),
    })),
    execute: async ({ categoryId }) => {
      const existing = await db.noteCategory.findFirst({
        where: { id: categoryId },
      });
      if (!existing) return { error: "Kategorin hittades inte." };

      await db.noteCategory.delete({ where: { id: categoryId } });

      emitNoteCategoryDeletedToTenant(tenantId, {
        categoryId,
        name: existing.name,
        slug: existing.slug,
        color: existing.color,
      });

      return { success: true, message: "Kategori borttagen." };
    },
  });

  return {
    // Projektlista och hantering
    getProjectList,
    createProject,
    updateProject,
    archiveProject,
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
    exportTimeReport,
    exportTaskList,
    generateProjectReport,
    // Filer
    listFiles,
    getProjectFiles: listFiles,
    deleteFile,
    getPersonalFiles,
    searchFiles,
    analyzeDocument,
    analyzePersonalFile,
    analyzeImage,
    movePersonalFileToProject,
    // Projektmedlemmar
    listMembers,
    getAvailableMembers,
    addMember,
    removeMember,
    // Inbjudningar
    sendInvitation,
    listInvitations,
    cancelInvitation,
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
    // E-postmallar (admin)
    listEmailTemplates,
    getEmailTemplate,
    updateEmailTemplate,
    previewEmailTemplate,
    // Skicka e-post (förbereder preview, användaren skickar via knapp)
    prepareEmailToExternalRecipients,
    prepareEmailToTeamMembers,
    prepareEmailToProjectMembers,
    getTeamMembersForEmailTool,
    getProjectsForEmailTool,
    getProjectMembersForEmailTool,
    // Notifikationsinställningar
    getNotificationSettings,
    updateNotificationSettings,
    // Anteckningskategorier
    listNoteCategories,
    createNoteCategory,
    updateNoteCategory,
    deleteNoteCategory,
  };
}
