"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { notifyTaskAssigned } from "@/lib/notification-delivery";
import type { TaskStatus, Priority } from "../../generated/prisma/client";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type TaskAssignee = {
  membershipId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  assignments: TaskAssignee[];
};

export type GetTasksResult =
  | { success: true; tasks: TaskItem[] }
  | { success: false; error: string };

export type TaskActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type AssignTaskResult = {
  success: boolean;
  error?: string;
};

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  deadline: z.string().optional(),
});

const updateTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]),
});

const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]),
  deadline: z.string().optional(),
});

const deleteTaskSchema = z.object({
  taskId: z.string().min(1),
});

const assignTaskSchema = z.object({
  taskId: z.string().min(1),
  membershipId: z.string().min(1),
});

// ─────────────────────────────────────────
// Server Actions
// ─────────────────────────────────────────

/**
 * Get all tasks for a project, with assignments included.
 * Requires auth + project access check.
 */
export async function getTasks(projectId: string): Promise<GetTasksResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  const tasks = await db.task.findMany({
    where: { projectId },
    include: {
      assignments: {
        include: {
          membership: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped: TaskItem[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    projectId: t.projectId,
    assignments: t.assignments.map((a) => ({
      membershipId: a.membershipId,
      user: a.membership.user,
    })),
  }));

  return { success: true, tasks: mapped };
}

/**
 * Update task status (drag-and-drop).
 * Requires auth + project access check.
 */
export async function updateTaskStatus(
  projectId: string,
  data: { taskId: string; status: string }
): Promise<TaskActionResult> {
  const { tenantId, userId } = await requirePermission("canUpdateTasks");
  await requireProject(tenantId, projectId, userId);

  const parsed = updateTaskStatusSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  // Verify task belongs to project
  const task = await db.task.findFirst({
    where: { id: parsed.data.taskId, projectId },
  });
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  await db.task.update({
    where: { id: parsed.data.taskId },
    data: { status: parsed.data.status as TaskStatus },
  });

  await logActivity(
    tenantId,
    projectId,
    userId,
    parsed.data.status === "DONE" ? "completed" : "statusChanged",
    "task",
    task.id,
    {
      title: task.title,
      previousStatus: task.status,
      newStatus: parsed.data.status,
    }
  );

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Create a new task in a project.
 * Requires auth + project access check + Zod validation.
 */
export async function createTask(
  projectId: string,
  formData: FormData
): Promise<TaskActionResult> {
  const { tenantId, userId } = await requirePermission("canCreateTasks");
  await requireProject(tenantId, projectId, userId);

  const raw = {
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    priority: formData.get("priority") || "MEDIUM",
    deadline: formData.get("deadline") || undefined,
  };

  const parsed = createTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const createdTask = await db.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority as Priority,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
      status: "TODO" as TaskStatus,
      project: { connect: { id: projectId } },
    },
  });

  await logActivity(tenantId, projectId, userId, "created", "task", createdTask.id, {
    title: createdTask.title,
    status: createdTask.status,
    priority: createdTask.priority,
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Assign a task to a project member (creates TaskAssignment).
 * Requires auth + project access check.
 */
export async function assignTask(
  projectId: string,
  data: { taskId: string; membershipId: string }
): Promise<AssignTaskResult> {
  const { tenantId, userId, user } = await requirePermission("canAssignTasks");
  const project = await requireProject(tenantId, projectId, userId);

  const parsed = assignTaskSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  // Verify task belongs to project
  const task = await db.task.findFirst({
    where: { id: parsed.data.taskId, projectId },
  });
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  // Verify membership belongs to tenant
  const membership = await db.membership.findUnique({
    where: { id: parsed.data.membershipId },
    include: {
      user: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!membership) {
    return { success: false, error: "MEMBER_NOT_FOUND" };
  }

  // Check if already assigned
  const existing = await db.taskAssignment.findFirst({
    where: {
      taskId: parsed.data.taskId,
      membershipId: parsed.data.membershipId,
    },
  });
  if (existing) {
    return { success: false, error: "ALREADY_ASSIGNED" };
  }

  await db.taskAssignment.create({
    data: {
      task: { connect: { id: parsed.data.taskId } },
      membership: { connect: { id: parsed.data.membershipId } },
    },
  });

  await logActivity(
    tenantId,
    projectId,
    userId,
    "assigned",
    "task",
    task.id,
    {
      title: task.title,
      membershipId: parsed.data.membershipId,
    }
  );

  if (membership.user.id !== userId) {
    await notifyTaskAssigned({
      tenantId,
      projectId,
      taskId: task.id,
      taskTitle: task.title,
      assignedToUserId: membership.user.id,
      assignedByName: user.name ?? user.email ?? "",
      projectName: project.name,
    });
  }

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Update all fields of a task (title, description, priority, status, deadline).
 * Requires auth + project access check + Zod validation.
 */
export async function updateTask(
  projectId: string,
  data: {
    taskId: string;
    title: string;
    description?: string;
    priority: string;
    status: string;
    deadline?: string;
  }
): Promise<TaskActionResult> {
  const { tenantId, userId } = await requirePermission("canUpdateTasks");
  const project = await requireProject(tenantId, projectId, userId);

  const parsed = updateTaskSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const task = await db.task.findFirst({
    where: { id: parsed.data.taskId, projectId },
  });
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  await db.task.update({
    where: { id: parsed.data.taskId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority as Priority,
      status: parsed.data.status as TaskStatus,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    },
  });

  const action: "updated" | "statusChanged" | "completed" =
    task.status !== parsed.data.status
      ? parsed.data.status === "DONE"
        ? "completed"
        : "statusChanged"
      : "updated";

  await logActivity(tenantId, projectId, userId, action, "task", task.id, {
    title: parsed.data.title,
    previousStatus: task.status,
    newStatus: parsed.data.status,
    priority: parsed.data.priority,
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Delete a task from a project.
 * Requires auth + project access check.
 */
export async function deleteTask(
  projectId: string,
  data: { taskId: string }
): Promise<TaskActionResult> {
  const { tenantId, userId } = await requirePermission("canDeleteTasks");
  await requireProject(tenantId, projectId, userId);

  const parsed = deleteTaskSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const task = await db.task.findFirst({
    where: { id: parsed.data.taskId, projectId },
  });
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  // Delete assignments first, then task
  await db.taskAssignment.deleteMany({
    where: { taskId: parsed.data.taskId },
  });

  await db.task.delete({
    where: { id: parsed.data.taskId },
  });

  await logActivity(tenantId, projectId, userId, "deleted", "task", task.id, {
    title: task.title,
    status: task.status,
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Unassign a task from a project member (deletes TaskAssignment).
 * Requires auth + project access check.
 */
export async function unassignTask(
  projectId: string,
  data: { taskId: string; membershipId: string }
): Promise<AssignTaskResult> {
  const { tenantId, userId } = await requirePermission("canAssignTasks");
  await requireProject(tenantId, projectId, userId);

  const parsed = assignTaskSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const assignment = await db.taskAssignment.findFirst({
    where: {
      taskId: parsed.data.taskId,
      membershipId: parsed.data.membershipId,
    },
  });
  if (!assignment) {
    return { success: false, error: "ASSIGNMENT_NOT_FOUND" };
  }

  await db.taskAssignment.delete({
    where: { id: assignment.id },
  });

  await logActivity(
    tenantId,
    projectId,
    userId,
    "updated",
    "task",
    parsed.data.taskId,
    {
      membershipId: parsed.data.membershipId,
      change: "unassigned",
    }
  );

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}
