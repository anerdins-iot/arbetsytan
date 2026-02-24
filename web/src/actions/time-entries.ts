"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import {
  getTimeEntriesCore,
  getMyTimeEntriesCore,
  getTimeSummaryCore,
} from "@/services/time-entry-service";
import { getProjectTasksCore } from "@/services/task-service";

const idSchema = z.union([z.string().uuid(), z.string().cuid()]);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createTimeEntrySchema = z.object({
  taskId: idSchema.optional(),
  projectId: idSchema.optional(),
  minutes: z.number().int().positive(),
  date: dateStringSchema,
  description: z.string().max(500).optional(),
  entryType: z.enum(["WORK", "VACATION", "SICK", "VAB", "PARENTAL", "EDUCATION", "OTHER"]).default("WORK"),
});

const updateTimeEntrySchema = z
  .object({
    taskId: idSchema.nullable().optional(),
    projectId: idSchema.optional(),
    minutes: z.number().int().positive().optional(),
    date: dateStringSchema.optional(),
    description: z.string().max(500).optional(),
    entryType: z.enum(["WORK", "VACATION", "SICK", "VAB", "PARENTAL", "EDUCATION", "OTHER"]).optional(),
  })
  .refine(
    (data) =>
      data.taskId !== undefined ||
      data.projectId !== undefined ||
      data.minutes !== undefined ||
      data.date !== undefined ||
      data.description !== undefined ||
      data.entryType !== undefined,
    {
      message: "NO_FIELDS_TO_UPDATE",
    }
  );

export type TimeEntryItem = {
  id: string;
  description: string | null;
  minutes: number;
  date: string;
  createdAt: string;
  updatedAt: string;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  userId: string;
  isMine: boolean;
  entryType: string;
};

export type GroupedTimeEntries = {
  date: string;
  totalMinutes: number;
  entries: TimeEntryItem[];
};

export type ProjectTimeSummary = {
  totalMinutes: number;
  byType: Array<{ type: string; totalMinutes: number }>;
  byTask: Array<{ taskId: string; taskTitle: string; totalMinutes: number }>;
  byPerson: Array<{ userId: string; userName: string; totalMinutes: number }>;
  byDay: Array<{ date: string; totalMinutes: number }>;
  byWeek: Array<{ weekStart: string; totalMinutes: number }>;
};

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getWeekStart(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + mondayOffset);
  return copy;
}

function mapEntry(
  entry: {
    id: string;
    description: string | null;
    minutes: number;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
    taskId: string | null;
    userId: string;
    projectId: string | null;
    project: { name: string } | null;
    task: { title: string } | null;
    entryType: string;
  },
  currentUserId: string
): TimeEntryItem {
  return {
    id: entry.id,
    description: entry.description,
    minutes: entry.minutes,
    date: entry.date.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    taskId: entry.taskId,
    taskTitle: entry.task?.title ?? null,
    projectId: entry.projectId,
    projectName: entry.project?.name ?? null,
    userId: entry.userId,
    isMine: entry.userId === currentUserId,
    entryType: entry.entryType,
  };
}

function groupEntriesByDay(entries: TimeEntryItem[]): GroupedTimeEntries[] {
  const grouped = new Map<string, GroupedTimeEntries>();

  for (const entry of entries) {
    const key = toDateKey(new Date(entry.date));
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        date: key,
        totalMinutes: entry.minutes,
        entries: [entry],
      });
      continue;
    }
    current.totalMinutes += entry.minutes;
    current.entries.push(entry);
  }

  return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export async function createTimeEntry(input: {
  taskId?: string;
  projectId?: string;
  minutes: number;
  date: string;
  description?: string;
  entryType?: "WORK" | "VACATION" | "SICK" | "VAB" | "PARENTAL" | "EDUCATION" | "OTHER";
}): Promise<ActionResult<TimeEntryItem>> {
  const { tenantId, userId } = await requireAuth();
  const parsed = createTimeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const { taskId, projectId, minutes, date, description, entryType } = parsed.data;

  const db = tenantDb(tenantId);
  let resolvedProjectId = projectId;
  let resolvedTaskId = taskId;

  if (taskId) {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return { success: false, error: "TASK_NOT_FOUND" };
    }
    resolvedProjectId = task.project.id;
  }

  if (resolvedProjectId) {
    await requireProject(tenantId, resolvedProjectId, userId);
  }

  const dbWithEmit = tenantDb(tenantId, { 
    actorUserId: userId, 
    projectId: resolvedProjectId || undefined 
  });

  const created = await dbWithEmit.timeEntry.create({
    data: {
      taskId: resolvedTaskId || null,
      projectId: resolvedProjectId || null,
      userId,
      tenantId, // Explicitly pass tenantId
      minutes,
      date: new Date(date),
      description: description?.trim() || null,
      entryType: entryType as any,
    },
    include: {
      project: { select: { name: true } },
      task: { select: { title: true } },
    },
  }) as any;

  if (resolvedProjectId) {
    revalidatePath("/[locale]/projects/[projectId]", "page");
    revalidatePath("/[locale]/projects/[projectId]/time", "page");
  }
  revalidatePath("/[locale]/time", "page");

  return { success: true, data: mapEntry(created, userId) };
}

export async function getTimeEntriesByProject(
  projectId: string
): Promise<ActionResult<GroupedTimeEntries[]>> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const entries = await getTimeEntriesCore({ tenantId, userId }, projectId);

  const mapped: TimeEntryItem[] = entries.map((entry) => ({
    id: entry.id,
    description: entry.description,
    minutes: entry.minutes,
    date: toDateKey(entry.date),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
    projectId: entry.projectId,
    projectName: entry.projectName ?? "Okänt projekt",
    userId: entry.userId,
    isMine: entry.userId === userId,
    entryType: entry.entryType,
  }));
  return { success: true, data: groupEntriesByDay(mapped) };
}

export async function getMyTimeEntries(): Promise<ActionResult<TimeEntryItem[]>> {
  const { tenantId, userId } = await requireAuth();

  const entries = await getMyTimeEntriesCore({ tenantId, userId });

  return {
    success: true,
    data: entries.map((entry) => ({
      id: entry.id,
      description: entry.description,
      minutes: entry.minutes,
      date: toDateKey(entry.date),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      taskId: entry.taskId,
      taskTitle: entry.taskTitle,
      projectId: entry.projectId,
      projectName: entry.projectName ?? "Personlig",
      userId: entry.userId,
      isMine: true,
      entryType: entry.entryType,
    })),
  };
}

export type MyTimeEntriesGroupedResult = {
  groupedEntries: GroupedTimeEntries[];
  tasks: Array<{ id: string; title: string }>;
};

export async function getMyTimeEntriesGrouped(): Promise<ActionResult<MyTimeEntriesGroupedResult>> {
  const { tenantId, userId } = await requireAuth();

  const entriesResult = await getMyTimeEntries();
  if (!entriesResult.success) return entriesResult;

  const groupedEntries = groupEntriesByDay(entriesResult.data);
  const projectIds = [...new Set(entriesResult.data.map((e) => e.projectId).filter(Boolean))] as string[];

  const taskOptions: Array<{ id: string; title: string }> = [];
  for (const projectId of projectIds) {
    try {
      await requireProject(tenantId, projectId, userId);
      const tasks = await getProjectTasksCore({ tenantId, userId }, projectId);
      taskOptions.push(...tasks.map((t) => ({ id: t.id, title: t.title })));
    } catch {
      // Skip projects user no longer has access to
    }
  }

  return {
    success: true,
    data: { groupedEntries, tasks: taskOptions },
  };
}

export async function updateTimeEntry(
  id: string,
  data: {
    taskId?: string | null;
    projectId?: string;
    minutes?: number;
    date?: string;
    description?: string;
    entryType?: "WORK" | "VACATION" | "SICK" | "VAB" | "PARENTAL" | "EDUCATION" | "OTHER";
  }
): Promise<ActionResult<TimeEntryItem>> {
  const { tenantId, userId } = await requireAuth();
  const parsedId = idSchema.safeParse(id);
  const parsedData = updateTimeEntrySchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const db = tenantDb(tenantId);

  const existing = await db.timeEntry.findFirst({
    where: { id: parsedId.data, userId },
  });

  if (!existing) {
    return { success: false, error: "TIME_ENTRY_NOT_FOUND" };
  }

  let targetTaskId = parsedData.data.taskId !== undefined ? parsedData.data.taskId : (existing as any).taskId;
  let targetProjectId = parsedData.data.projectId !== undefined ? parsedData.data.projectId : (existing as any).projectId;

  if (parsedData.data.taskId) {
    const task = await db.task.findUnique({
      where: { id: parsedData.data.taskId },
      select: { id: true, projectId: true },
    });
    if (!task) {
      return { success: false, error: "TASK_NOT_FOUND" };
    }
    targetTaskId = task.id;
    targetProjectId = task.projectId;
  }

  if (targetProjectId) {
    await requireProject(tenantId, targetProjectId, userId);
  }

  const dbWithEmit = tenantDb(tenantId, { 
    actorUserId: userId, 
    projectId: targetProjectId || undefined 
  });

  const updated = await dbWithEmit.timeEntry.update({
    where: { id: existing.id },
    data: {
      taskId: targetTaskId,
      projectId: targetProjectId,
      minutes: parsedData.data.minutes ?? existing.minutes,
      date: parsedData.data.date ? new Date(parsedData.data.date) : existing.date,
      description:
        parsedData.data.description !== undefined
          ? parsedData.data.description.trim() || null
          : existing.description,
      entryType: parsedData.data.entryType ?? (existing as any).entryType,
    },
    include: {
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
  }) as any;

  if ((existing as any).projectId) {
    revalidatePath("/[locale]/projects/[projectId]", "page");
    revalidatePath("/[locale]/projects/[projectId]/time", "page");
  }
  if (targetProjectId && targetProjectId !== (existing as any).projectId) {
    revalidatePath("/[locale]/projects/[projectId]", "page");
    revalidatePath("/[locale]/projects/[projectId]/time", "page");
  }
  revalidatePath("/[locale]/time", "page");

  return { success: true, data: mapEntry(updated, userId) };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  const { tenantId, userId } = await requireAuth();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const db = tenantDb(tenantId);
  const existing = (await db.timeEntry.findFirst({
    where: { id: parsedId.data, userId },
  })) as any;

  if (!existing) {
    return { success: false, error: "TIME_ENTRY_NOT_FOUND" };
  }

  if (existing.projectId) {
    await requireProject(tenantId, existing.projectId, userId);
  }

  const dbWithEmit = tenantDb(tenantId, { actorUserId: userId, projectId: existing.projectId || undefined });
  await dbWithEmit.timeEntry.delete({ where: { id: existing.id } });

  if (existing.projectId) {
    revalidatePath("/[locale]/projects/[projectId]", "page");
    revalidatePath("/[locale]/projects/[projectId]/time", "page");
  }
  revalidatePath("/[locale]/time", "page");

  return { success: true, data: undefined };
}

export async function getProjectTimeSummary(
  projectId: string
): Promise<ActionResult<ProjectTimeSummary>> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const summary = await getTimeSummaryCore({ tenantId, userId }, projectId);
  return { success: true, data: summary };
}
