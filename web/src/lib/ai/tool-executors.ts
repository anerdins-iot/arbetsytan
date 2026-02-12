/**
 * Tool executors - server-only.
 * Contains the actual execution logic for schedulable tools.
 * Import this only from server-side code.
 */

import { tenantDb } from "@/lib/db";
import { createNotification } from "@/actions/notifications";
import { logActivity } from "@/lib/activity-log";
import {
  emitTaskCreatedToProject,
  emitTaskUpdatedToProject,
} from "@/lib/socket";
import type { Priority, TaskStatus } from "../../../generated/prisma/client";
import { getToolDefinition } from "./tool-definitions";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type ToolContext = {
  tenantId: string;
  userId: string;
  projectId: string | null;
};

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type ToolExecutor = (
  params: Record<string, unknown>,
  ctx: ToolContext
) => Promise<ToolResult>;

// ─────────────────────────────────────────
// Tool Executors
// ─────────────────────────────────────────

const executeNotify: ToolExecutor = async (params, ctx) => {
  const message = String(params.message ?? "Påminnelse");
  const title = params.title ? String(params.title) : "Automatisering";

  const res = await createNotification({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId ?? undefined,
    title,
    body: message,
  });

  if (!res.success) {
    return { success: false, error: res.error };
  }
  return { success: true, data: { notificationId: res.notification?.id } };
};

const executeCreateTask: ToolExecutor = async (params, ctx) => {
  const projectId = (params.projectId as string) ?? ctx.projectId;
  if (!projectId) {
    return { success: false, error: "projectId required" };
  }

  const title = params.title as string;
  if (!title) {
    return { success: false, error: "title required" };
  }

  const db = tenantDb(ctx.tenantId);

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  const task = await db.task.create({
    data: {
      title,
      description: (params.description as string) ?? null,
      priority: ((params.priority as string) ?? "MEDIUM") as Priority,
      deadline: params.deadline ? new Date(params.deadline as string) : null,
      status: "TODO" as TaskStatus,
      project: { connect: { id: projectId } },
    },
  });

  await logActivity(ctx.tenantId, projectId, ctx.userId, "created", "task", task.id, {
    title: task.title,
    source: "automation",
  });

  emitTaskCreatedToProject(projectId, {
    projectId,
    taskId: task.id,
    actorUserId: ctx.userId,
  });

  return { success: true, data: { taskId: task.id } };
};

const executeUpdateTask: ToolExecutor = async (params, ctx) => {
  const taskId = params.taskId as string;
  if (!taskId) {
    return { success: false, error: "taskId required" };
  }

  const projectId = (params.projectId as string) ?? ctx.projectId;
  if (!projectId) {
    return { success: false, error: "projectId required" };
  }

  const db = tenantDb(ctx.tenantId);

  const task = await db.task.findFirst({
    where: { id: taskId, projectId },
  });
  if (!task) {
    return { success: false, error: "Task not found" };
  }

  const updateData: Record<string, unknown> = {};
  if (params.title !== undefined) updateData.title = params.title;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.status !== undefined) updateData.status = params.status;
  if (params.priority !== undefined) updateData.priority = params.priority;
  if (params.deadline !== undefined) {
    updateData.deadline = params.deadline ? new Date(params.deadline as string) : null;
  }

  const updated = await db.task.update({
    where: { id: taskId },
    data: updateData,
  });

  await logActivity(ctx.tenantId, projectId, ctx.userId, "updated", "task", taskId, {
    changes: updateData as Record<string, string | number | boolean | null>,
    source: "automation",
  });

  emitTaskUpdatedToProject(projectId, {
    projectId,
    taskId,
    actorUserId: ctx.userId,
  });

  return { success: true, data: { taskId: updated.id } };
};

const executeCreateNote: ToolExecutor = async (params, ctx) => {
  const content = params.content as string;
  if (!content) {
    return { success: false, error: "content required" };
  }

  const projectId = (params.projectId as string) ?? ctx.projectId;
  const db = tenantDb(ctx.tenantId);

  if (projectId) {
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return { success: false, error: "Project not found" };
    }
  }

  const note = await db.note.create({
    data: {
      title: (params.title as string) ?? "",
      content,
      category: (params.category as string) ?? null,
      ...(projectId ? { project: { connect: { id: projectId } } } : {}),
      createdBy: { connect: { id: ctx.userId } },
    },
  });

  if (projectId) {
    await logActivity(ctx.tenantId, projectId, ctx.userId, "created", "note", note.id, {
      title: note.title,
      source: "automation",
    });
  }

  return { success: true, data: { noteId: note.id } };
};

const executeCreatePersonalNote: ToolExecutor = async (params, ctx) => {
  const content = params.content as string;
  if (!content) {
    return { success: false, error: "content required" };
  }

  const db = tenantDb(ctx.tenantId);

  const note = await db.note.create({
    data: {
      title: (params.title as string) ?? "",
      content,
      category: (params.category as string) ?? null,
      createdBy: { connect: { id: ctx.userId } },
    },
  });

  return { success: true, data: { noteId: note.id } };
};

const executeCreateComment: ToolExecutor = async (params, ctx) => {
  const taskId = params.taskId as string;
  const content = params.content as string;

  if (!taskId) return { success: false, error: "taskId required" };
  if (!content) return { success: false, error: "content required" };

  const projectId = (params.projectId as string) ?? ctx.projectId;
  if (!projectId) return { success: false, error: "projectId required" };

  const db = tenantDb(ctx.tenantId);

  const task = await db.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) return { success: false, error: "Task not found" };

  const comment = await db.comment.create({
    data: {
      content,
      task: { connect: { id: taskId } },
      authorId: ctx.userId,
    },
  });

  await logActivity(ctx.tenantId, projectId, ctx.userId, "created", "comment", comment.id, {
    taskId,
    source: "automation",
  });

  return { success: true, data: { commentId: comment.id } };
};

const executeCreateTimeEntry: ToolExecutor = async (params, ctx) => {
  const projectId = (params.projectId as string) ?? ctx.projectId;
  if (!projectId) return { success: false, error: "projectId required" };

  const taskId = params.taskId as string;
  const minutes = params.minutes
    ? Number(params.minutes)
    : params.hours
      ? Number(params.hours) * 60
      : null;

  if (!minutes || minutes <= 0) {
    return { success: false, error: "minutes or hours required" };
  }

  const date = params.date ? new Date(params.date as string) : new Date();
  const db = tenantDb(ctx.tenantId);

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return { success: false, error: "Project not found" };

  if (taskId) {
    const task = await db.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) return { success: false, error: "Task not found" };
  }

  const timeEntry = await db.timeEntry.create({
    data: {
      description: (params.description as string) ?? null,
      minutes,
      date,
      project: { connect: { id: projectId } },
      ...(taskId ? { task: { connect: { id: taskId } } } : {}),
      userId: ctx.userId,
    },
  });

  await logActivity(ctx.tenantId, projectId, ctx.userId, "created", "timeEntry", timeEntry.id, {
    minutes,
    taskId,
    source: "automation",
  });

  return { success: true, data: { timeEntryId: timeEntry.id } };
};

// ─────────────────────────────────────────
// Executor Map
// ─────────────────────────────────────────

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  notify: executeNotify,
  createTask: executeCreateTask,
  updateTask: executeUpdateTask,
  createNote: executeCreateNote,
  createPersonalNote: executeCreatePersonalNote,
  createComment: executeCreateComment,
  createTimeEntry: executeCreateTimeEntry,
};

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/**
 * Execute a tool by name.
 * Used by automation executor and potentially AI agents.
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const tool = getToolDefinition(toolName);

  if (!tool) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) {
    return { success: false, error: `Tool "${toolName}" has no executor` };
  }

  try {
    return await executor(params, ctx);
  } catch (err) {
    console.error(`[tool-executors] Error executing ${toolName}:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if a tool has an executor.
 */
export function hasExecutor(toolName: string): boolean {
  return toolName in TOOL_EXECUTORS;
}
