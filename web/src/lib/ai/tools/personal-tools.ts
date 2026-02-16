/**
 * Personal AI tools. All use tenantDb(tenantId). Conversation owned by userId.
 * Personlig AI har direkt tillgång till användarens projekt via projectId-parameter.
 */
import { tool, generateText } from "ai";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { toolInputSchema } from "@/lib/ai/tools/schema-helper";
import { requireProject, requirePermission } from "@/lib/auth";
import { userDb, tenantDb, prisma, type TenantScopedClient, type UserScopedClient } from "@/lib/db";
import { validateDatabaseId } from "@/services/types";
import { getProjectsCore, getProjectDetailCore } from "@/services/project-service";
import { getProjectTasksCore, getUserTasksCore } from "@/services/task-service";
import { getProjectFilesCore, getPersonalFilesCore } from "@/services/file-service";
import { getCommentsCore } from "@/services/comment-service";
import { getTimeEntriesCore, getTimeSummaryCore, getMyTimeEntriesCore } from "@/services/time-entry-service";
import { getProjectNotesCore, getPersonalNotesCore } from "@/services/note-service";
import { getProjectMembersCore, getAvailableMembersCore } from "@/services/member-service";
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
  generateExcelDocument,
  generateWordDocument,
  readExcelFileContent,
  editExcelFileContent,
  readWordFileContent,
  analyzeDocxTemplate,
  fillDocxTemplate,
} from "@/lib/ai/tools/shared-tools";
import { getOcrTextForFile, fetchFileFromMinIO } from "@/lib/ai/ocr";
import { analyzeImageWithVision } from "@/lib/ai/file-processors";
import { searchEmails } from "@/lib/ai/email-embeddings";
import {
  type MessageEmbeddingsDb,
  searchConversations,
} from "@/lib/ai/message-embeddings";
import { getConversationCore } from "@/services/email-conversations";
import { getEmailsForUser } from "@/lib/email-log";
import {
  createAutomation as createAutomationAction,
  listAutomations as listAutomationsAction,
} from "@/actions/automations";
import {
  copyObjectInMinio,
  projectObjectKey,
  ensureTenantBucket,
  createPresignedDownloadUrl,
} from "@/lib/minio";
import { getFilePreviewData } from "@/actions/files";
import { logActivity } from "@/lib/activity-log";
import { notifyProjectStatusChanged } from "@/lib/notification-delivery";
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
  createComment as createCommentAction,
  updateComment as updateCommentAction,
} from "@/actions/comments";
import {
  createTimeEntry as createTimeEntryAction,
  updateTimeEntry as updateTimeEntryAction,
} from "@/actions/time-entries";
import {
  createNote as createNoteAction,
  updateNote as updateNoteAction,
} from "@/actions/notes";
import {
  createPersonalNote as createPersonalNoteAction,
  updatePersonalNote as updatePersonalNoteAction,
} from "@/actions/personal";
import {
  assignTask as assignTaskAction,
  unassignTask as unassignTaskAction,
} from "@/actions/tasks";
import {
  toggleNotePin as toggleNotePinAction,
} from "@/actions/notes";
import {
  togglePersonalNotePin as togglePersonalNotePinAction,
} from "@/actions/personal";
import {
  getAutomation as getAutomationAction,
  updateAutomation as updateAutomationAction,
  pauseAutomation as pauseAutomationAction,
  resumeAutomation as resumeAutomationAction,
} from "@/actions/automations";
import {
  getNotifications as getNotificationsAction,
  markNotificationRead as markNotificationReadAction,
  markAllNotificationsRead as markAllNotificationsReadAction,
} from "@/actions/notifications";
import {
  deletePersonalFile as deletePersonalFileAction,
  moveProjectFileToPersonal as moveProjectFileToPersonalAction,
} from "@/actions/personal";
import { deleteNoteCategory as deleteNoteCategoryAction } from "@/actions/note-categories";

export type PersonalToolsContext = {
  db: TenantScopedClient;
  tenantId: string;
  userId: string;
  /** User-scoped client for personal data (conversations, message embeddings). Pass userDb(userId) from chat route. */
  udb?: UserScopedClient;
};

export function createPersonalTools(ctx: PersonalToolsContext) {
  const { db, tenantId, userId, udb } = ctx;

  // ─── Projektlista och översikt ────────────────────────

  const getProjectList = tool({
    description: "Hämta listan över projekt som användaren är medlem i (id, namn, status).",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignored"),
    })),
    execute: async () => {
      const projects = await getProjectsCore(
        { tenantId, userId },
        { includeTaskCount: false }
      );
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
      const tasks = await getUserTasksCore({ tenantId, userId }, { limit });
      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline?.toISOString() ?? null,
        projectName: t.projectName,
        projectId: t.projectId,
        assignees: t.assignments.map((a) => a.user.name ?? a.user.email),
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
      const tasks = await getProjectTasksCore(
        { tenantId, userId },
        pid,
        { includeProject: true, limit }
      );
      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline?.toISOString() ?? null,
        projectName: t.projectName,
        assignees: t.assignments.map((a) => ({
          membershipId: a.membershipId,
          name: a.user.name ?? a.user.email,
          email: a.user.email,
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
      const projectDb = tenantDb(tenantId, { actorUserId: userId, projectId: pid });
      return createTaskShared({
        db: projectDb,
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
      const projectDb = tenantDb(tenantId, { actorUserId: userId, projectId: pid });
      return updateTaskShared({
        db: projectDb,
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
      const result = await assignTaskAction(pid, { taskId, membershipId });
      if (!result.success) return { error: result.error || "Kunde inte tilldela uppgiften." };
      return { message: "Uppgiften har tilldelats." };
    },
  });

  const unassignTask = tool({
    description: "Ta bort en tilldelning från en uppgift. Kräver projectId, taskId och membershipId.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("Uppgiftens ID"),
      membershipId: z.string().describe("MembershipId för den som ska tas bort (från listMembers)"),
    })),
    execute: async ({ projectId: pid, taskId, membershipId }) => {
      const result = await unassignTaskAction(pid, { taskId, membershipId });
      if (!result.success) return { error: result.error || "Kunde inte ta bort tilldelningen." };
      return { message: "Tilldelningen har tagits bort." };
    },
  });

  const deleteTask = tool({
    description:
      "Ta bort en uppgift från ett projekt. VIKTIGT: Kan inte ångras. Uppgiften och alla dess tilldelningar raderas. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      taskId: z.string().describe("ID för uppgiften som ska tas bort"),
    })),
    execute: async ({ projectId: pid, taskId }) => {
      await requireProject(tenantId, pid, userId);

      const task = await db.task.findFirst({
        where: { id: taskId, projectId: pid },
        select: { id: true, title: true },
      });
      if (!task) return { error: "Uppgiften hittades inte i detta projekt." };

      return {
        __deleteConfirmation: true as const,
        type: "task" as const,
        items: [{ id: task.id, label: task.title }],
        actionParams: { projectId: pid, taskId },
        message: `Bekräfta radering av uppgiften "${task.title}".`,
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

      const result = await getCommentsCore({ tenantId, userId }, pid, taskId);
      if ("error" in result) return { error: "Uppgiften hittades inte i detta projekt." };

      return result.comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        author: c.author.name
          ? { name: c.author.name, email: c.author.email }
          : { name: "Okänd användare", email: "unknown" },
      }));
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
      const result = await createCommentAction(pid, { taskId, content });
      if (!result.success) return { error: result.error || "Kunde inte skapa kommentar." };
      return { message: "Kommentar skapad på uppgiften." };
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
      const result = await updateCommentAction(pid, { commentId, content });
      if (!result.success) {
        if (result.error === "FORBIDDEN") return { error: "Endast författaren kan uppdatera sin egen kommentar." };
        return { error: result.error || "Kunde inte uppdatera kommentar." };
      }
      return { id: commentId, message: "Kommentar uppdaterad." };
    },
  });

  const deleteComment = tool({
    description:
      "Ta bort en kommentar. Endast kommentarer som användaren själv skapat kan tas bort. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      commentId: z.string().describe("Kommentarens ID"),
    })),
    execute: async ({ projectId: pid, commentId }) => {
      await requireProject(tenantId, pid, userId);

      const comment = await db.comment.findFirst({
        where: { id: commentId, task: { projectId: pid } },
        select: { id: true, content: true, authorId: true },
      });
      if (!comment) return { error: "Kommentaren hittades inte." };
      if (comment.authorId !== userId) {
        return { error: "Endast författaren kan ta bort sin egen kommentar." };
      }

      const label = comment.content.length > 50 ? comment.content.slice(0, 50) + "…" : comment.content;
      return {
        __deleteConfirmation: true as const,
        type: "comment" as const,
        items: [{ id: comment.id, label }],
        actionParams: { projectId: pid, commentId },
        message: `Bekräfta radering av kommentaren.`,
      };
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

      const entries = await getTimeEntriesCore(
        { tenantId, userId },
        pid,
        { limit }
      );

      return entries.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        taskTitle: entry.taskTitle,
        minutes: entry.minutes,
        hours: Math.floor(entry.minutes / 60),
        remainingMinutes: entry.minutes % 60,
        date: entry.date.toISOString().split("T")[0],
        description: entry.description,
        userName: entry.userName,
        userId: entry.userId,
        createdAt: entry.createdAt.toISOString(),
      }));
    },
  });

  const smartLogTime = tool({
    description:
      "Registrera tid smart baserat på naturlig text. Extraherar tid, datum och beskrivning, samt söker efter matchande uppgifter i projektet. Om ingen uppgift matchar perfekt föreslås en ny BRED uppgift (t.ex. 'Kabeldragning' istället för 'Kabel till fläkt').",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      text: z.string().describe("Naturlig beskrivning, t.ex. 'idag har jag dragit kabel i källaren till fläktaggregatet, 5 timmar'"),
    })),
    execute: async ({ projectId: pid, text }) => {
      await requireProject(tenantId, pid, userId);

      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // 1. Extrahera data från texten med en snabb AI-modell
      const extractionPrompt = `Du är en expert på tidrapportering. Extrahera duration (minuter), datum och en ren beskrivning från följande text.
Text: "${text}"
Dagens datum är: ${today}

Returnera ENBART JSON i följande format:
{
  "minutes": number,
  "date": "YYYY-MM-DD",
  "description": "ren beskrivning av vad som gjorts",
  "category": "bred arbetskategori (t.ex. Kabeldragning, Rörarbete, Målning, Montering, Elinstallation, Snickeri, Annat)"
}`;

      let extracted;
      try {
        const { text: resultText } = await generateText({
          model: anthropic("claude-3-5-sonnet-latest"),
          prompt: extractionPrompt,
        });
        const cleaned = resultText.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
        extracted = JSON.parse(cleaned);
      } catch (err) {
        return { error: "Kunde inte tolka texten. Försök att vara mer specifik med tid och vad du gjort." };
      }

      // 2. Sök efter matchande uppgifter i projektet
      const tasks = await getProjectTasksCore({ tenantId, userId }, pid, { limit: 100 });
      
      const matches = tasks.map(t => {
        // Enkel matchning: kolla om titeln finns i beskrivningen eller vice versa
        const score = (
          (extracted.description.toLowerCase().includes(t.title.toLowerCase()) ? 0.5 : 0) +
          (t.title.toLowerCase().includes(extracted.category.toLowerCase()) ? 0.3 : 0)
        );
        return { id: t.id, title: t.title, score };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

      return {
        extracted: {
          minutes: extracted.minutes,
          hours: Math.floor(extracted.minutes / 60),
          remainingMinutes: extracted.minutes % 60,
          date: extracted.date,
          description: extracted.description,
          category: extracted.category
        },
        suggestions: {
          existingTasks: matches,
          newBroadTask: extracted.category,
          noTask: true
        },
        message: `Jag har tolkat din rapport: ${extracted.minutes} minuter den ${extracted.date}. Vill du koppla den till en befintlig uppgift, skapa en ny generell uppgift "${extracted.category}", eller registrera den utan specifik uppgift?`
      };
    },
  });

  const createTimeEntry = tool({
    description:
      "Skapa en ny tidsrapport. Kan kopplas till ett projekt och/eller en uppgift. Ange minuter eller timmar, datum, entryType (WORK, VACATION, etc.) och valfri beskrivning.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID (valfritt för personlig tid)"),
      taskId: z.string().optional().describe("Uppgiftens ID (valfritt)"),
      minutes: z.number().int().positive().optional().describe("Antal minuter"),
      hours: z.number().positive().optional().describe("Antal timmar (konverteras till minuter)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Datum YYYY-MM-DD"),
      description: z.string().max(500).optional().describe("Beskrivning av arbetet"),
      entryType: z.enum(["WORK", "VACATION", "SICK", "VAB", "PARENTAL", "EDUCATION", "OTHER"]).optional().default("WORK").describe("Typ av tidrapport"),
    })),
    execute: async ({ projectId: pid, taskId, minutes, hours, date, description, entryType }) => {
      if (pid) {
        const idCheck = validateDatabaseId(pid, "projectId");
        if (!idCheck.valid) return { error: idCheck.error };
      }
      if (taskId) {
        const taskIdCheck = validateDatabaseId(taskId, "taskId");
        if (!taskIdCheck.valid) return { error: taskIdCheck.error };
      }

      const totalMinutes = minutes ?? Math.round((hours ?? 0) * 60);
      if (totalMinutes <= 0) return { error: "Tid måste vara större än 0." };

      const result = await createTimeEntryAction({
        taskId,
        projectId: pid,
        minutes: totalMinutes,
        date,
        description: description?.trim() || undefined,
        entryType: entryType as any,
      });

      if (!result.success) return { error: result.error || "Kunde inte skapa tidsrapport." };

      const data = result.data!;
      const projectLabel = data.projectName ? ` i projekt "${data.projectName}"` : "";
      const taskLabel = data.taskTitle ? ` på uppgiften "${data.taskTitle}"` : "";
      
      return {
        id: data.id,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        projectId: data.projectId,
        projectName: data.projectName,
        minutes: data.minutes,
        hours: Math.floor(data.minutes / 60),
        remainingMinutes: data.minutes % 60,
        date: data.date,
        description: data.description,
        entryType: data.entryType,
        message: `Tidsrapport (${data.entryType}) på ${totalMinutes} min loggad${projectLabel}${taskLabel}.`,
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
    execute: async ({ projectId: _pid, timeEntryId, taskId, minutes, hours, date, description }) => {
      const updateData: { taskId?: string; minutes?: number; date?: string; description?: string } = {};
      if (taskId !== undefined) updateData.taskId = taskId;
      if (minutes !== undefined) updateData.minutes = minutes;
      else if (hours !== undefined) updateData.minutes = Math.round(hours * 60);
      if (date !== undefined) updateData.date = date;
      if (description !== undefined) updateData.description = description.trim() || undefined;

      if (updateData.minutes !== undefined && updateData.minutes <= 0) {
        return { error: "Tid måste vara större än 0." };
      }

      const result = await updateTimeEntryAction(timeEntryId, updateData);
      if (!result.success) return { error: result.error || "Kunde inte uppdatera tidsrapport." };

      const data = result.data!;
      return {
        id: data.id,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        minutes: data.minutes,
        hours: Math.floor(data.minutes / 60),
        remainingMinutes: data.minutes % 60,
        date: data.date,
        description: data.description,
        message: "Tidsrapport uppdaterad.",
      };
    },
  });

  const deleteTimeEntry = tool({
    description:
      "Ta bort en tidsrapport. Endast egna tidsrapporter kan tas bort. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      timeEntryId: z.string().describe("Tidsrapportens ID"),
    })),
    execute: async ({ timeEntryId }) => {
      const entry = await db.timeEntry.findFirst({
        where: { id: timeEntryId, userId },
        select: { id: true, minutes: true, date: true, task: { select: { title: true } } },
      });
      if (!entry) return { error: "Tidsrapporten hittades inte eller du har inte behörighet." };

      const label = `${entry.task?.title ?? "Tidsrapport"} - ${entry.minutes} min (${entry.date.toISOString().split("T")[0]})`;
      return {
        __deleteConfirmation: true as const,
        type: "timeEntry" as const,
        items: [{ id: entry.id, label }],
        actionParams: { timeEntryId: entry.id },
        message: `Bekräfta radering av tidsrapporten.`,
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

      const summary = await getTimeSummaryCore({ tenantId, userId }, pid);

      return {
        totalMinutes: summary.totalMinutes,
        totalHours: `${Math.floor(summary.totalMinutes / 60)}h ${summary.totalMinutes % 60}min`,
        byTask: summary.byTask.map((t) => ({
          ...t,
          hours: `${Math.floor(t.totalMinutes / 60)}h ${t.totalMinutes % 60}min`,
        })),
        byPerson: summary.byPerson.map((p) => ({
          ...p,
          hours: `${Math.floor(p.totalMinutes / 60)}h ${p.totalMinutes % 60}min`,
        })),
        byWeek: summary.byWeek.slice(0, 12),
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
          model: anthropic("claude-opus-4-6"),
          prompt,
          maxOutputTokens: 2000,
          timeout: 120_000, // 120 second timeout for large reports
        });
        summary = result.text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Kunde inte generera rapporttext: ${msg}` };
      }

      console.log("[generateProjectReport] Generating PDF");
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
        name: pdfResult.fileName,
        message: `Rapporten "${pdfResult.fileName}" har sparats i projektets fillista.`,
      };
    },
  });

  // ─── Rapportförhandsvisning (Preview → Generera) ──────

  const createReport = tool({
    description:
      "Skapa en rapportförhandsvisning som användaren kan granska och redigera innan den genereras. " +
      "Returnerar en preview-vy i chatten med titel, sammanfattning och sektioner. " +
      "Användaren kan redigera, avbryta eller bekräfta generering. " +
      "Använd detta istället för generateProjectReport när du vill ge användaren möjlighet att granska rapporten först. " +
      "Sektioner kan vara text (markdown), table (med data[][]) eller list.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID (valfritt, utelämna för personlig rapport)"),
      title: z.string().describe("Rapportens titel"),
      summary: z.string().describe("Kort sammanfattning av rapporten (1-3 meningar)"),
      sections: z.array(z.object({
        title: z.string().describe("Sektionsrubrik"),
        content: z.string().describe("Sektionsinnehåll (markdown stöds)"),
        type: z.enum(["text", "table", "list"]).default("text").describe("Typ av sektion: text, table eller list"),
        data: z.array(z.array(z.string())).optional().describe("Tabelldata om type=table (rader med kolumner, första raden = rubriker)"),
      })).describe("Rapportens sektioner"),
      format: z.enum(["pdf", "excel", "word"]).default("pdf").describe("Outputformat"),
    })),
    execute: async ({ projectId: pid, title, summary, sections, format }) => {
      let projectName: string | undefined;
      if (pid) {
        const idCheck = validateDatabaseId(pid, "projectId");
        if (!idCheck.valid) return { error: idCheck.error };
        const project = await requireProject(tenantId, pid, userId);
        projectName = project.name;
      }

      return {
        __reportPreview: true as const,
        title,
        summary,
        sections,
        projectId: pid,
        projectName,
        format,
      };
    },
  });

  // ─── Filer (Files) ────────────────────────────────────

  const listFiles = tool({
    description: "Lista filer i ett projekt (id, namn, typ, storlek, datum, analyser). Bildfiler får previewUrl för visning i chatten.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets unika ID (från listProjects, t.ex. 'cmlmey73b00071fo435f077if'). INTE filnamn!"),
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal filer"),
    })),
    execute: async ({ projectId: pid, limit = 50 }) => {
      const idCheck = validateDatabaseId(pid, "projectId");
      if (!idCheck.valid) return { error: idCheck.error };
      await requireProject(tenantId, pid, userId);

      const files = await getProjectFilesCore(
        { tenantId, userId },
        pid,
        { includeAnalyses: true, analysesLimit: 5, limit }
      );

      const isImage = (t: string) => t.startsWith("image/");
      const withPreview = await Promise.all(
        files.map(async (f) => {
          const base = {
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.size,
            createdAt: f.createdAt.toISOString(),
            label: f.label,
            userDescription: f.userDescription,
            ocrPreview: f.ocrText ? f.ocrText.slice(0, 300) + (f.ocrText.length > 300 ? "…" : "") : null,
            analyses: f.analyses.map((a) => ({
              prompt: a.prompt,
              content: a.content,
              createdAt: a.createdAt.toISOString(),
            })),
          };
          if (isImage(f.type)) {
            try {
              const previewUrl = await createPresignedDownloadUrl({
                bucket: f.bucket,
                key: f.objectKey,
              });
              return { ...base, previewUrl };
            } catch {
              return base;
            }
          }
          return base;
        })
      );
      return withPreview;
    },
  });

  const deleteFile = tool({
    description: "Radera en fil från ett projekt permanent. Kräver projectId och fileId. VIKTIGT: Kan inte ångras. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      fileId: z.string().describe("Filens ID"),
    })),
    execute: async ({ projectId: pid, fileId }) => {
      await requireProject(tenantId, pid, userId);

      const file = await db.file.findFirst({
        where: { id: fileId, projectId: pid },
        select: { id: true, name: true },
      });
      if (!file) return { error: "Filen hittades inte i detta projekt." };

      return {
        __deleteConfirmation: true as const,
        type: "file" as const,
        items: [{ id: file.id, label: file.name }],
        actionParams: { projectId: pid, fileId: file.id },
        message: `Bekräfta radering av filen "${file.name}".`,
      };
    },
  });

  const getPersonalFiles = tool({
    description:
      "Hämta användarens personliga filer (filer uppladdade i chatten utan projektkontext). Returnerar filens ID (för movePersonalFileToProject), namn, typ, storlek, datum och analyser. Bildfiler får previewUrl. ANROPA DETTA FÖRST för att få fileId innan du flyttar filer.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(100).optional().default(50).describe("Max antal filer"),
    })),
    execute: async ({ limit = 50 }) => {
      const files = await getPersonalFilesCore(
        { tenantId, userId },
        { includeAnalyses: true, analysesLimit: 5, limit }
      );

      const isImage = (t: string) => t.startsWith("image/");
      const withPreview = await Promise.all(
        files.map(async (f) => {
          const base = {
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.size,
            createdAt: f.createdAt.toISOString(),
            label: f.label,
            userDescription: f.userDescription,
            hasOcrText: !!f.ocrText,
            ocrPreview: f.ocrText ? f.ocrText.slice(0, 300) + (f.ocrText.length > 300 ? "…" : "") : null,
            analyses: f.analyses.map((a) => ({
              prompt: a.prompt,
              content: a.content,
              createdAt: a.createdAt.toISOString(),
            })),
          };
          if (isImage(f.type)) {
            try {
              const previewUrl = await createPresignedDownloadUrl({
                bucket: f.bucket,
                key: f.objectKey,
              });
              return { ...base, previewUrl };
            } catch {
              return base;
            }
          }
          return base;
        })
      );
      return withPreview;
    },
  });

  const getFilePreviewUrl = tool({
    description:
      "Hämta en förhandsgransknings-URL för en fil. Använd detta för att visa bilder i chatten med markdown: ![beskrivning](url). Returnerar presigned URL som är giltig i 30 minuter.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("Filens unika ID"),
      projectId: z.string().optional().describe("Projekt-ID om det är en projektfil (utelämna för personlig fil)"),
    })),
    execute: async ({ fileId, projectId: pid }) => {
      const fileIdCheck = validateDatabaseId(fileId, "fileId");
      if (!fileIdCheck.valid) return { error: fileIdCheck.error };
      if (pid) {
        const projectIdCheck = validateDatabaseId(pid, "projectId");
        if (!projectIdCheck.valid) return { error: projectIdCheck.error };
      }

      const result = await getFilePreviewData({ fileId, projectId: pid });
      if (!result.success) return { error: result.error };
      const file = result.file;
      const isImage = file.type.startsWith("image/");
      return {
        previewUrl: file.downloadUrl,
        fileName: file.name,
        fileType: file.type,
        isImage,
      };
    },
  });

  const searchFiles = tool({
    description:
      "ANVÄND DETTA VERKTYG när användaren frågar om dokument, filer, ritningar, eller specifikt innehåll (t.ex. 'elschema', 'ventilationsritning', 'offert'). Söker i alla projekt användaren har tillgång till PLUS personliga filer. Semantisk sökning i OCR-text från PDF:er och ritningar. Returnerar matchande dokument med projektnamn och relevanta utdrag.",
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
        const udb = userDb(userId, {});
        const [projectFileCount, personalFileCount] = await Promise.all([
          db.file.count({
            where: {
              projectId: { in: projectIds.length > 0 ? projectIds : ["__none__"] },
              ocrText: { not: null },
            },
          }),
          udb.file.count({ where: { ocrText: { not: null } } }),
        ]);
        const fileCount = projectFileCount + personalFileCount;

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
      const udb = userDb(userId, {});
      const file = await udb.file.findFirst({
        where: { id: fileId },
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
        const udb = userDb(userId, {});
        file = await udb.file.findFirst({
          where: { id: fileId },
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

      // Kolla om exakt samma fråga redan ställts - returnera cachad om så
      if (question) {
        const cached = await prisma.fileAnalysis.findFirst({
          where: { fileId, prompt: question, tenantId },
          orderBy: { createdAt: "desc" },
          select: { content: true, createdAt: true },
        });
        if (cached) {
          return {
            fileName: file.name,
            analysis: cached.content,
            ocrText: file.ocrText || null,
            message: "Bildanalys klar (cachad).",
            cached: true,
          };
        }
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

      // Spara analys till FileAnalysis
      await prisma.fileAnalysis.create({
        data: {
          content: analysis,
          prompt: question || null,
          model: "claude-opus-4-6",
          type: "agent",
          fileId,
          tenantId,
          projectId: pid || null,
          userId,
        },
      });

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
      "Flytta eller kopiera en personlig fil till ett projekt. Filen kopieras till projektets fillagring och kan valfritt tas bort från personliga filer. VIKTIGT: Anropa FÖRST getPersonalFiles för att få fileId, och listProjects för att få projectId.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("Filens unika ID (från getPersonalFiles, t.ex. 'abc123'). INTE filnamn!"),
      projectId: z.string().describe("Projektets unika ID (från listProjects, t.ex. 'cmlmey73b00071fo435f077if'). INTE projektnamn!"),
      deleteOriginal: z.boolean().optional().default(false).describe("Om true tas originalfilen bort efter kopiering"),
    })),
    execute: async ({ fileId, projectId: pid, deleteOriginal = false }) => {
      const projectIdCheck = validateDatabaseId(pid, "projectId");
      if (!projectIdCheck.valid) return { error: projectIdCheck.error };
      const fileIdCheck = validateDatabaseId(fileId, "fileId");
      if (!fileIdCheck.valid) return { error: fileIdCheck.error };

      await requireProject(tenantId, pid, userId);

      const udb = userDb(userId, {});
      const file = await udb.file.findFirst({
        where: { id: fileId },
        select: { id: true, name: true, type: true, size: true, bucket: true, key: true, ocrText: true },
      });
      if (!file) return { error: `Ingen personlig fil med ID "${fileId}" hittades. Kör getPersonalFiles först för att se tillgängliga filer och deras ID:n.` };

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

      // Ta bort originalet om så önskas (personlig fil → userDb)
      if (deleteOriginal) {
        await udb.file.delete({ where: { id: fileId } });
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

  const moveProjectFileToPersonal = tool({
    description:
      "Flytta en fil FRÅN ett projekt TILL användarens personliga filer. Använd när användaren vill flytta orelevanta eller felplacerade filer till sitt personliga utrymme istället för att radera dem. VIKTIGT: Anropa FÖRST listFiles (eller getProjectFiles) för att få fileId, och listProjects för att få projectId.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets unika ID"),
      fileId: z.string().describe("Filens unika ID (från listFiles)"),
    })),
    execute: async ({ projectId: pid, fileId }) => {
      const projectIdCheck = validateDatabaseId(pid, "projectId");
      if (!projectIdCheck.valid) return { error: projectIdCheck.error };
      const fileIdCheck = validateDatabaseId(fileId, "fileId");
      if (!fileIdCheck.valid) return { error: fileIdCheck.error };

      const result = await moveProjectFileToPersonalAction({ projectId: pid, fileId });

      if (!result.success) {
        const msg =
          result.error === "FILE_NOT_FOUND"
            ? "Filen hittades inte i projektet eller du har inte behörighet."
            : result.error === "VALIDATION_ERROR"
              ? "Ogiltiga parametrar."
              : "Kunde inte flytta filen.";
        return { error: msg };
      }

      return {
        success: true,
        newFileId: result.file.id,
        message: `Filen "${result.file.name}" har flyttats till dina personliga filer.`,
      };
    },
  });

  const deletePersonalFile = tool({
    description:
      "Radera en personlig fil permanent. Filen kan inte återställas. Använd fileId från getPersonalFiles. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      fileId: z.string().describe("ID för filen som ska raderas (från getPersonalFiles)"),
    })),
    execute: async ({ fileId }) => {
      const fileIdCheck = validateDatabaseId(fileId, "fileId");
      if (!fileIdCheck.valid) return { error: fileIdCheck.error };

      const udb = userDb(userId, {});
      const file = await udb.file.findFirst({
        where: { id: fileId },
        select: { id: true, name: true },
      });
      if (!file) return { error: "Filen hittades inte eller du har inte behörighet." };

      return {
        __deleteConfirmation: true as const,
        type: "personalFile" as const,
        items: [{ id: file.id, label: file.name }],
        actionParams: { fileId: file.id },
        message: `Bekräfta radering av den personliga filen "${file.name}".`,
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
      const members = await getProjectMembersCore({ tenantId, userId }, pid);
      return members.map((m) => ({
        membershipId: m.membershipId,
        userName: m.user.name ?? m.user.email,
        email: m.user.email,
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
      const available = await getAvailableMembersCore({ tenantId, userId }, pid);
      return available.map((m) => ({
        membershipId: m.membershipId,
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
      const result = await addProjectMemberAction(pid, membershipId);
      if (!result.success) return { error: result.error || "Kunde inte lägga till medlem." };
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
      const result = await removeProjectMemberAction(pid, membershipId);
      if (!result.success) return { error: result.error || "Kunde inte ta bort medlem." };
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

      const notes = await getProjectNotesCore(
        { tenantId, userId },
        pid,
        { category, limit }
      );

      return notes.map((n) => ({
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
      const result = await createNoteAction(pid, { title, content, category });
      if (!result.success) return { error: result.error || "Kunde inte skapa anteckning." };
      return {
        id: result.note.id,
        title: result.note.title,
        content: result.note.content,
        category: result.note.category,
        createdAt: result.note.createdAt,
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
      const data: { content?: string; title?: string; category?: string | null } = {};
      if (content !== undefined) data.content = content;
      if (title !== undefined) data.title = title;
      if (category !== undefined) data.category = category;
      if (Object.keys(data).length === 0) return { error: "Inga fält att uppdatera. Ange content, title eller category." };

      const result = await updateNoteAction(pid, noteId, data);
      if (!result.success) return { error: result.error || "Kunde inte uppdatera anteckning." };
      return {
        id: result.note.id,
        title: result.note.title,
        content: result.note.content,
        category: result.note.category,
        message: "Anteckning uppdaterad.",
      };
    },
  });

  const deleteProjectNote = tool({
    description: "Ta bort en anteckning från ett projekt. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ projectId: pid, noteId }) => {
      await requireProject(tenantId, pid, userId);

      const note = await db.note.findFirst({
        where: { id: noteId, projectId: pid },
        select: { id: true, title: true, content: true },
      });
      if (!note) return { error: "Anteckningen hittades inte i detta projekt." };

      const label = note.title || (note.content.length > 50 ? note.content.slice(0, 50) + "…" : note.content);
      return {
        __deleteConfirmation: true as const,
        type: "projectNote" as const,
        items: [{ id: note.id, label }],
        actionParams: { projectId: pid, noteId: note.id },
        message: `Bekräfta radering av anteckningen.`,
      };
    },
  });

  const toggleNotePin = tool({
    description: "Fästa eller lossa en projektanteckning. Fästa anteckningar visas överst.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ projectId: pid, noteId }) => {
      const result = await toggleNotePinAction(pid, noteId);
      if (!result.success) return { error: result.error || "Kunde inte ändra fästningsstatus." };
      return {
        isPinned: result.isPinned,
        message: result.isPinned ? "Anteckningen är nu fastad." : "Anteckningen är inte längre fastad.",
      };
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
      const notes = await getPersonalNotesCore(
        { tenantId, userId },
        { category, limit }
      );

      return notes.map((n) => ({
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
      const result = await createPersonalNoteAction({ title, content, category });
      if (!result.success) return { error: result.error || "Kunde inte skapa anteckning." };
      return {
        id: result.note.id,
        title: result.note.title,
        content: result.note.content,
        category: result.note.category,
        createdAt: result.note.createdAt,
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
      const result = await updatePersonalNoteAction(noteId, { content, title, category });
      if (!result.success) return { error: result.error || "Kunde inte uppdatera anteckning." };
      return {
        id: result.note.id,
        title: result.note.title,
        content: result.note.content,
        category: result.note.category,
        message: "Personlig anteckning uppdaterad.",
      };
    },
  });

  const deletePersonalNote = tool({
    description: "Ta bort en personlig anteckning. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ noteId }) => {
      const udb = userDb(userId, {});
      const note = await udb.note.findFirst({
        where: { id: noteId },
        select: { id: true, title: true, content: true },
      });
      if (!note) return { error: "Anteckningen hittades inte." };

      const label = note.title || (note.content.length > 50 ? note.content.slice(0, 50) + "…" : note.content);
      return {
        __deleteConfirmation: true as const,
        type: "personalNote" as const,
        items: [{ id: note.id, label }],
        actionParams: { noteId: note.id },
        message: `Bekräfta radering av den personliga anteckningen.`,
      };
    },
  });

  const togglePersonalNotePin = tool({
    description: "Fästa eller lossa en personlig anteckning. Fästa anteckningar visas överst.",
    inputSchema: toolInputSchema(z.object({
      noteId: z.string().describe("Anteckningens ID"),
    })),
    execute: async ({ noteId }) => {
      const result = await togglePersonalNotePinAction(noteId);
      if (!result.success) return { error: result.error || "Kunde inte ändra fästningsstatus." };
      return {
        isPinned: result.isPinned,
        message: result.isPinned ? "Anteckningen är nu fastad." : "Anteckningen är inte längre fastad.",
      };
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
      const udb = userDb(userId, {});
      const notes = await udb.note.findMany({
        where: {
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
    description: "Ta bort en schemalagd automation. Ange automationens ID (från listAutomations). Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      automationId: z.string().describe("Automationens ID som ska tas bort"),
    })),
    execute: async ({ automationId }) => {
      const result = await listAutomationsAction({});
      if (!result.success) return { error: result.error };
      const automation = result.automations.find((a) => a.id === automationId);
      if (!automation) return { error: "Automationen hittades inte." };

      return {
        __deleteConfirmation: true as const,
        type: "automation" as const,
        items: [{ id: automation.id, label: automation.name }],
        actionParams: { automationId: automation.id },
        message: `Bekräfta radering av automationen "${automation.name}".`,
      };
    },
  });

  const getAutomation = tool({
    description: "Hämta detaljer för en specifik automation.",
    inputSchema: toolInputSchema(z.object({
      automationId: z.string().describe("Automationens ID"),
    })),
    execute: async ({ automationId }) => {
      const result = await getAutomationAction(automationId);
      if (!result.success) return { error: result.error || "Kunde inte hämta automation." };
      return result.automation;
    },
  });

  const updateAutomation = tool({
    description: "Uppdatera en automation. Ange de fält som ska ändras.",
    inputSchema: toolInputSchema(z.object({
      automationId: z.string().describe("Automationens ID"),
      name: z.string().optional().describe("Nytt namn"),
      description: z.string().optional().nullable().describe("Ny beskrivning"),
      triggerAt: z.string().optional().describe("Ny trigger-tid (ISO-datum)"),
      recurrence: z.string().optional().nullable().describe("Återkommande schema"),
      actionTool: z.string().optional().describe("Nytt action-verktyg"),
    })),
    execute: async ({ automationId, ...data }) => {
      const result = await updateAutomationAction(automationId, data);
      if (!result.success) return { error: result.error || "Kunde inte uppdatera automation." };
      return { message: "Automation uppdaterad." };
    },
  });

  const pauseAutomation = tool({
    description: "Pausa en aktiv automation.",
    inputSchema: toolInputSchema(z.object({
      automationId: z.string().describe("Automationens ID"),
    })),
    execute: async ({ automationId }) => {
      const result = await pauseAutomationAction(automationId);
      if (!result.success) return { error: result.error || "Kunde inte pausa automation." };
      return { message: "Automation pausad." };
    },
  });

  const resumeAutomation = tool({
    description: "Återuppta en pausad automation.",
    inputSchema: toolInputSchema(z.object({
      automationId: z.string().describe("Automationens ID"),
    })),
    execute: async ({ automationId }) => {
      const result = await resumeAutomationAction(automationId);
      if (!result.success) return { error: result.error || "Kunde inte återuppta automation." };
      return { message: "Automation återupptagen." };
    },
  });

  const getNotifications = tool({
    description: "Hämta användarens notifieringar. Visar olästa och lästa notifieringar.",
    inputSchema: toolInputSchema(z.object({
      unreadOnly: z.boolean().optional().default(false).describe("Visa bara olästa"),
      limit: z.number().min(1).max(50).optional().default(20).describe("Max antal"),
    })),
    execute: async ({ limit }) => {
      const result = await getNotificationsAction({ limit });
      return {
        notifications: result.notifications,
        unreadCount: result.unreadCount,
      };
    },
  });

  const markNotificationRead = tool({
    description: "Markera en notifiering som läst.",
    inputSchema: toolInputSchema(z.object({
      notificationId: z.string().describe("Notifieringens ID"),
    })),
    execute: async ({ notificationId }) => {
      const result = await markNotificationReadAction({ notificationId });
      if (!result.success) return { error: result.error || "Kunde inte markera notifiering." };
      return { message: "Notifiering markerad som läst." };
    },
  });

  const markAllNotificationsRead = tool({
    description: "Markera alla notifieringar som lästa.",
    inputSchema: toolInputSchema(z.object({
      _: z.string().optional().describe("Ignorerad"),
    })),
    execute: async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.success) return { error: result.error || "Kunde inte markera notifieringar." };
      return { message: "Alla notifieringar markerade som lästa." };
    },
  });

  const getMyTimeEntries = tool({
    description: "Hämta användarens egna tidsrapporter från alla projekt.",
    inputSchema: toolInputSchema(z.object({
      limit: z.number().min(1).max(200).optional().default(50).describe("Max antal tidsposter"),
    })),
    execute: async ({ limit }) => {
      const entries = await getMyTimeEntriesCore(
        { tenantId, userId },
        { limit }
      );
      return entries.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        taskTitle: entry.taskTitle,
        projectId: entry.projectId,
        projectName: entry.projectName,
        minutes: entry.minutes,
        hours: Math.floor(entry.minutes / 60),
        remainingMinutes: entry.minutes % 60,
        date: entry.date.toISOString().split("T")[0],
        description: entry.description,
      }));
    },
  });

  const getProjectDetail = tool({
    description: "Hämta detaljerad information om ett projekt inklusive task-status, medlemmar och tillgängliga medlemmar.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().describe("Projektets ID"),
    })),
    execute: async ({ projectId: pid }) => {
      await requireProject(tenantId, pid, userId);
      const detail = await getProjectDetailCore({ tenantId, userId }, pid);
      if (!detail) return { error: "Projektet hittades inte." };
      return {
        id: detail.id,
        name: detail.name,
        description: detail.description,
        status: detail.status,
        address: detail.address,
        createdAt: detail.createdAt.toISOString(),
        taskStatusCounts: detail.taskStatusCounts,
        memberCount: detail.members.length,
        members: detail.members.map((m) => ({
          membershipId: m.membershipId,
          name: m.user.name ?? m.user.email,
          email: m.user.email,
          role: m.role,
        })),
      };
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

      // Use tenantDb with emitContext for auto-emit
      const dbWithEmit = tenantDb(tenantId, { actorUserId: userId });
      const category = await dbWithEmit.noteCategory.create({
        data: { name, slug, color: color ?? null, tenantId },
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

      // Use tenantDb with emitContext for auto-emit
      const dbWithEmit = tenantDb(tenantId, { actorUserId: userId });
      const category = await dbWithEmit.noteCategory.update({
        where: { id: categoryId },
        data: updateData,
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
    description: "Ta bort en anteckningskategori. Anteckningar med denna kategori behåller sin kategori-text men kategorin försvinner från listan. Användaren måste bekräfta raderingen i chatten.",
    inputSchema: toolInputSchema(z.object({
      categoryId: z.string().describe("Kategorins ID"),
    })),
    execute: async ({ categoryId }) => {
      const existing = await db.noteCategory.findFirst({
        where: { id: categoryId },
      });
      if (!existing) return { error: "Kategorin hittades inte." };

      return {
        __deleteConfirmation: true as const,
        type: "noteCategory" as const,
        items: [{ id: existing.id, label: existing.name }],
        actionParams: { categoryId: existing.id },
        message: `Bekräfta radering av kategorin "${existing.name}".`,
      };
    },
  });

  // ─── Generiska filgenereringsverktyg ──────────────────────
  const generatePdf = tool({
    description:
      "Generera en PDF-fil och spara i ett projekts fillista eller i personliga filer. Ange filnamn (.pdf), titel och innehåll. Valfritt projectId: om angivet sparas filen i projektet, annars i personliga filer. Valfritt: template (projektrapport, offert, protokoll) eller instructions så att Opus genererar innehåll.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID – utelämna för att spara i personliga filer"),
      fileName: z.string().describe("Filnamn t.ex. rapport.pdf"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().optional().describe("Brödtext i markdown eller vanlig text (valfritt om instructions anges)"),
      template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
        .describe("Layout-mall eller null för fritt format"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att generera innehållet, t.ex. 'Skapa en offert för elinstallation i villa'"),
    })),
    execute: async ({ projectId: pid, fileName, title, content, template, instructions }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return generatePdfDocument({
        db, tenantId, projectId: pid, userId,
        fileName, title, content: content ?? "", template: template ?? null, instructions,
      });
    },
  });

  const generateExcel = tool({
    description:
      "Generera en Excel-fil (.xlsx) och spara i ett projekt eller i personliga filer. Valfritt projectId: om angivet sparas i projektet, annars i personliga filer. Ange filnamn (.xlsx), valfri titel och sheets eller instructions så att Opus genererar data. Valfritt template 'materiallista' för formaterad tabell.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID – utelämna för att spara i personliga filer"),
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
    execute: async ({ projectId: pid, fileName, title, sheets, template, instructions }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return generateExcelDocument({
        db, tenantId, projectId: pid, userId,
        fileName, title, sheets, template: template ?? null, instructions,
      });
    },
  });

  const generateWord = tool({
    description:
      "Generera ett Word-dokument (.docx) och spara i ett projekt eller i personliga filer. Valfritt projectId: om angivet sparas i projektet, annars i personliga filer. Ange filnamn (.docx), titel och innehåll eller instructions så att Opus genererar innehåll. Valfritt template: projektrapport, offert, protokoll.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID – utelämna för att spara i personliga filer"),
      fileName: z.string().describe("Filnamn t.ex. offert.docx"),
      title: z.string().describe("Dokumentets titel"),
      content: z.string().optional().describe("Brödtext, stycken separeras med dubbla radbrytningar (valfritt om instructions anges)"),
      template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
        .describe("Layout-mall eller null för fritt format"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att generera innehållet, t.ex. 'Skriv ett mötesprotokoll'"),
    })),
    execute: async ({ projectId: pid, fileName, title, content, template, instructions }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return generateWordDocument({
        db, tenantId, projectId: pid, userId,
        fileName, title, content, template: template ?? null, instructions,
      });
    },
  });

  // ─── Läsa befintliga filer (mallar) ────────────────────────

  const readExcelFile = tool({
    description:
      "Läs innehållet från en Excel-fil i ett projekt eller bland personliga filer. Ange filens ID. Valfritt projectId: om angivet verifieras projekttillgång; utelämna för personliga filer.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID om filen tillhör ett projekt – utelämna för personlig fil"),
      fileId: z.string().describe("Filens ID från fillistan"),
    })),
    execute: async ({ projectId: pid, fileId }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return readExcelFileContent({ db, tenantId, fileId });
    },
  });

  const editExcelFile = tool({
    description:
      "Redigera en Excel-fil och spara som ny fil. Ange källfilens ID, nytt filnamn och ändringar (eller instructions). Valfritt projectId: om angivet sparas den nya filen i projektet, annars i personliga filer.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID – utelämna för att spara i personliga filer"),
      sourceFileId: z.string().describe("ID för original-filen (mallen)"),
      newFileName: z.string().describe("Namn på den nya filen (måste sluta med .xlsx)"),
      edits: z.array(z.object({
        sheet: z.string().optional().describe("Arknamn (valfritt, använder första arket om ej angivet)"),
        cell: z.string().describe("Cellreferens, t.ex. 'A1', 'B5', 'C10'"),
        value: z.union([z.string(), z.number()]).describe("Nytt värde för cellen"),
      })).optional().default([]).describe("Lista med ändringar att applicera (valfritt om instructions anges)"),
      instructions: z.string().optional()
        .describe("Instruktioner till AI för att bestämma ändringar, t.ex. 'Fyll i projektdata för Kund AB'"),
    })),
    execute: async ({ projectId: pid, sourceFileId, newFileName, edits, instructions }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return editExcelFileContent({
        db, tenantId, userId, projectId: pid, sourceFileId, newFileName, edits: edits ?? [], instructions,
      });
    },
  });

  const readWordFile = tool({
    description:
      "Läs textinnehållet från en Word-fil (.docx eller .doc) i ett projekt eller bland personliga filer. Ange filens ID. Valfritt projectId: om angivet verifieras projekttillgång; utelämna för personliga filer.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID om filen tillhör ett projekt – utelämna för personlig fil"),
      fileId: z.string().describe("Filens ID från fillistan"),
    })),
    execute: async ({ projectId: pid, fileId }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return readWordFileContent({ db, tenantId, fileId });
    },
  });

  // ─── Docxtemplater – mallanalys och ifyllning ─────────────

  const analyzeDocumentTemplate = tool({
    description:
      "Analysera en dokumentmall (.docx eller .pptx) och extrahera alla platshållare. Mallen använder {variabel}-syntax och {#loop}...{/loop}. Ange filens ID. Valfritt projectId om filen tillhör ett projekt.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID om mallfilen tillhör ett projekt – utelämna för personlig fil"),
      fileId: z.string().describe("Filens ID (mallfilen) från fillistan"),
    })),
    execute: async ({ projectId: pid, fileId }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return analyzeDocxTemplate({ db, tenantId, fileId });
    },
  });

  const fillDocumentTemplate = tool({
    description:
      "Fyll i en dokumentmall (.docx eller .pptx) med data och spara som ny fil. Ange mallfilens ID, nytt filnamn och data (JSON). Valfritt projectId: om angivet sparas filen i projektet, annars i personliga filer. Använd analyzeDocumentTemplate först för att se vilka variabler som behövs.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Projektets ID – utelämna för att spara i personliga filer"),
      sourceFileId: z.string().describe("ID för mallfilen"),
      newFileName: z.string().describe("Namn på den nya filen (samma filändelse som mallen, t.ex. offert-kund-abc.docx)"),
      data: z.record(z.string(), z.unknown()).describe("JSON-objekt med data att fylla i. Nycklar matchar mallens platshållare. Loopar = arrayer av objekt, t.ex. { kundnamn: 'AB Bygg', rader: [{ beskrivning: 'Kabel', pris: 500 }] }"),
    })),
    execute: async ({ projectId: pid, sourceFileId, newFileName, data }) => {
      if (pid) await requireProject(tenantId, pid, userId);
      return fillDocxTemplate({
        db, tenantId, projectId: pid, userId, sourceFileId, data, newFileName,
      });
    },
  });

  const listDocumentTemplates = tool({
    description:
      "Lista tillgängliga dokumentmallar för organisationen. Mallar är Word-filer (.docx/.dotx) med platshållare som kan fyllas i automatiskt. Filtrera på kategori: OFFER (offert), REPORT (rapport), CONTRACT (avtal), PROTOCOL (protokoll), eller lämna tomt för alla.",
    inputSchema: toolInputSchema(z.object({
      category: z.string().optional().describe("Filtrera på kategori: OFFER, REPORT, CONTRACT, PROTOCOL"),
    })),
    execute: async ({ category }) => {
      const templates = await db.documentTemplate.findMany({
        where: category ? { category: category.toUpperCase() } : undefined,
        include: { file: { select: { name: true } } },
        orderBy: { name: "asc" },
      });

      if (templates.length === 0) {
        return {
          message: category
            ? `Inga mallar hittades i kategorin "${category}".`
            : "Inga dokumentmallar finns ännu. Användaren kan ladda upp Word-mallar via filhanteringen.",
          templates: [],
        };
      }

      return {
        message: `Hittade ${templates.length} mall(ar).`,
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          fileId: t.fileId,
          fileName: t.file.name,
          variables: t.expectedVariables,
        })),
      };
    },
  });

  const getTemplateDetails = tool({
    description:
      "Hämta detaljerad information om en dokumentmall, inklusive vilka platshållare/variabler som finns. Använd detta innan du fyller i en mall för att veta vilken data som behövs.",
    inputSchema: toolInputSchema(z.object({
      templateId: z.string().describe("ID för mallen"),
    })),
    execute: async ({ templateId }) => {
      const template = await db.documentTemplate.findFirst({
        where: { id: templateId },
        include: { file: { select: { id: true, name: true } } },
      });

      if (!template) {
        return { success: false, error: "Mallen hittades inte" };
      }

      // If we don't have cached variables, analyze the template
      let variables = template.expectedVariables as string[] | null;
      if (!variables) {
        try {
          const result = await analyzeDocxTemplate({ db, tenantId, fileId: template.file.id });
          if ("variables" in result && result.variables) {
            variables = result.variables;
            await db.documentTemplate.update({
              where: { id: templateId },
              data: { expectedVariables: variables ?? undefined },
            });
          }
        } catch {
          // Ignore analysis errors
        }
      }

      return {
        success: true,
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          fileId: template.fileId,
          fileName: template.file.name,
          variables: variables ?? [],
        },
        hint: variables?.length
          ? `Mallen har ${variables.length} variabler: ${variables.join(", ")}. Använd fillDocumentTemplate med dessa som nycklar.`
          : "Använd analyzeDocumentTemplate för att hitta variablerna.",
      };
    },
  });

  // ─── E-postsökning ────────────────────────────────────

  const searchMyEmails = tool({
    description: "Sök i mina e-postmeddelanden med semantisk sökning. Använd för att hitta specifika emails baserat på innehåll, ämne eller avsändare.",
    inputSchema: toolInputSchema(z.object({
      query: z.string().describe("Sökfråga - vad du letar efter i emails"),
      projectId: z.string().optional().describe("Filtrera på specifikt projekt (valfritt)"),
      limit: z.number().optional().default(10).describe("Max antal resultat"),
    })),
    execute: async ({ query, projectId: pid, limit }) => {
      // Validera projectId om det anges
      if (pid) {
        const projectIdCheck = validateDatabaseId(pid, "projectId");
        if (!projectIdCheck.valid) return { error: projectIdCheck.error };
        await requireProject(tenantId, pid, userId);
      }

      const results = await searchEmails(tenantId, query, {
        limit,
        projectId: pid,
        userId,
      });

      return {
        emails: results.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          to: email.to,
          bodyPreview: email.bodyPreview,
          createdAt: email.createdAt.toISOString(),
          direction: email.direction,
          similarity: email.similarity,
          conversationId: email.conversationId ?? undefined,
        })),
        totalFound: results.length,
      };
    },
  });

  const searchConversationsTool = tool({
    description:
      "Sök i användarens chattkonversationer (AI-chatthistorik) med semantisk sökning. Använd för att hitta tidigare diskussioner, beslut eller information från chatten.",
    inputSchema: toolInputSchema(
      z.object({
        query: z.string().describe("Sökfråga - vad du letar efter i chatthistoriken"),
        limit: z.number().optional().default(10).describe("Max antal resultat"),
      })
    ),
    execute: async ({ query, limit }) => {
      const dbForSearch = udb
        ? (udb as unknown as MessageEmbeddingsDb)
        : undefined;
      if (!dbForSearch) {
        return {
          error:
            "Chattsökning är inte tillgänglig (saknar användar-klient). Kontakta support.",
          results: [],
          totalFound: 0,
        };
      }
      const results = await searchConversations(
        dbForSearch,
        tenantId,
        userId,
        query,
        { limit }
      );
      return {
        results: results.map((r) => ({
          conversationId: r.conversationId,
          messageId: r.messageId,
          snippet: r.snippet,
          similarity: r.similarity,
          createdAt: r.createdAt.toISOString(),
        })),
        totalFound: results.length,
      };
    },
  });

  const getConversationContext = tool({
    description:
      "Hämta hela en e-postkonversation (alla meddelanden i tråden). Använd när användaren frågar om innehållet i en specifik mailtråd eller när searchMyEmails returnerar conversationId och du behöver mer kontext.",
    inputSchema: toolInputSchema(z.object({
      conversationId: z.string().describe("Konversationens ID (finns i searchMyEmails-resultat när mailet tillhör en tråd)"),
    })),
    execute: async ({ conversationId: cid }) => {
      const conversationIdCheck = validateDatabaseId(cid, "conversationId");
      if (!conversationIdCheck.valid) return { error: conversationIdCheck.error };

      try {
        const conv = await getConversationCore(tenantId, userId, cid);
        return {
          subject: conv.subject,
          externalEmail: conv.externalEmail,
          externalName: conv.externalName,
          projectName: conv.projectName,
          messages: conv.messages.map((m) => ({
            from: m.fromEmail,
            fromName: m.fromName,
            to: m.toEmail,
            subject: m.subject,
            body: m.bodyText ?? (m.bodyHtml ? "(HTML)" : null),
            direction: m.direction,
            sentAt: m.sentAt?.toISOString() ?? null,
            receivedAt: m.receivedAt?.toISOString() ?? null,
            createdAt: m.createdAt.toISOString(),
          })),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "CONVERSATION_NOT_FOUND") {
          return { error: "Konversationen hittades inte eller du har inte åtkomst." };
        }
        return { error: msg };
      }
    },
  });

  const getMyRecentEmails = tool({
    description: "Hämta mina senaste e-postmeddelanden. Använd för att se e-posthistorik.",
    inputSchema: toolInputSchema(z.object({
      projectId: z.string().optional().describe("Filtrera på specifikt projekt (valfritt)"),
      limit: z.number().optional().default(10).describe("Max antal emails"),
      direction: z.enum(["INBOUND", "OUTBOUND"]).optional().describe("Filtrera på riktning (valfritt)"),
    })),
    execute: async ({ projectId: pid, limit, direction }) => {
      // Validera projectId om det anges
      if (pid) {
        const projectIdCheck = validateDatabaseId(pid, "projectId");
        if (!projectIdCheck.valid) return { error: projectIdCheck.error };
        await requireProject(tenantId, pid, userId);
      }

      const emails = await getEmailsForUser(tenantId, userId, {
        projectId: pid,
        limit,
        direction,
      });

      return {
        emails: emails.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          to: email.to,
          bodyPreview: email.bodyPreview,
          createdAt: email.createdAt.toISOString(),
          sentAt: email.sentAt?.toISOString() ?? null,
          direction: email.direction,
          status: email.status,
          attachmentCount: email._count.attachments,
          projectId: email.projectId,
        })),
        totalFound: emails.length,
      };
    },
  });

  // ─── Offert (Quote Preview) ──────────────────────────────

  const createQuote = tool({
    description:
      "Skapa en offert/prisförslag för en kund. Returnerar en interaktiv förhandsgranskning i chatten. Användaren kan granska rader, summor och moms innan PDF genereras. Ange kundnamn, titel, radposter med beskrivning/antal/enhet/pris, och valfritt giltighetsdatum och anteckningar.",
    inputSchema: toolInputSchema(
      z.object({
        projectId: z.string().optional().describe("Projekt-ID om offerten tillhör ett projekt"),
        clientName: z.string().describe("Kundens namn"),
        clientEmail: z.string().optional().describe("Kundens e-postadress"),
        title: z.string().describe("Offertens titel, t.ex. 'Badrumsrenovering'"),
        items: z
          .array(
            z.object({
              description: z.string().describe("Beskrivning av raden"),
              quantity: z.number().describe("Antal"),
              unit: z.string().describe("Enhet: st, tim, m, m2, etc."),
              unitPrice: z.number().describe("Styckpris exkl. moms i SEK"),
              vatRate: z.number().optional().describe("Momssats, default 0.25 (25%)"),
            })
          )
          .describe("Radposter i offerten"),
        validUntil: z.string().optional().describe("Giltig till datum (ISO-format YYYY-MM-DD)"),
        notes: z.string().optional().describe("Fritext/villkor som visas på offerten"),
        includeRot: z.boolean().optional().describe("Om ROT-avdrag ska tillämpas"),
      })
    ),
    execute: async ({ projectId: pid, clientName, clientEmail, title, items, validUntil, notes, includeRot }) => {
      let projectName: string | undefined;
      if (pid) {
        const project = await requireProject(tenantId, pid, userId);
        projectName = project.name;
      }

      return {
        __quotePreview: true,
        projectId: pid,
        projectName,
        clientName,
        clientEmail,
        title,
        items,
        validUntil,
        notes,
        includeRot,
        message: `Offert "${title}" förberedd för ${clientName}. Användaren måste klicka "Generera Offert (PDF)" för att skapa PDF.`,
      };
    },
  });

  return {
    // Projektlista och hantering
    getProjectList,
    getProjectDetail,
    createProject,
    updateProject,
    archiveProject,
    // Uppgifter
    getUserTasks,
    getProjectTasks,
    createTask,
    updateTask,
    assignTask,
    unassignTask,
    deleteTask,
    // Kommentarer
    getTaskComments,
    createComment,
    updateComment,
    deleteComment,
    // Tidrapportering
    getProjectTimeEntries,
    createTimeEntry,
    smartLogTime,
    updateTimeEntry,
    deleteTimeEntry,
    getProjectTimeSummary,
    getMyTimeEntries,
    generateProjectReport,
    createReport,
    // Filgenerering
    generatePdf,
    generateExcel,
    generateWord,
    // Läsa och redigera befintliga filer (mallar)
    readExcelFile,
    editExcelFile,
    readWordFile,
    // Dokumentmallar (docxtemplater)
    analyzeDocumentTemplate,
    fillDocumentTemplate,
    listDocumentTemplates,
    getTemplateDetails,
    // Filer
    listFiles,
    getProjectFiles: listFiles,
    deleteFile,
    getPersonalFiles,
    getFilePreviewUrl,
    searchFiles,
    analyzeDocument,
    analyzePersonalFile,
    analyzeImage,
    movePersonalFileToProject,
    moveProjectFileToPersonal,
    deletePersonalFile,
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
    toggleNotePin,
    searchNotes: searchProjectNotes,
    // Personliga anteckningar
    getPersonalNotes,
    createPersonalNote,
    updatePersonalNote,
    deletePersonalNote,
    togglePersonalNotePin,
    searchPersonalNotes,
    createAutomation,
    listAutomations,
    getAutomation,
    updateAutomation,
    pauseAutomation,
    resumeAutomation,
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
    // Notifieringar
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    // Notifikationsinställningar
    getNotificationSettings,
    updateNotificationSettings,
    // Anteckningskategorier
    listNoteCategories,
    createNoteCategory,
    updateNoteCategory,
    deleteNoteCategory,
    // E-postsökning
    searchMyEmails,
    getConversationContext,
    getMyRecentEmails,
    // Offert
    createQuote,
    // Chatthistorik
    searchConversations: searchConversationsTool,
  };
}
