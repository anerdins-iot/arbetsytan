"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

const idSchema = z.union([z.string().uuid(), z.string().cuid()]);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createTimeEntrySchema = z.object({
  taskId: idSchema,
  minutes: z.number().int().positive(),
  date: dateStringSchema,
  description: z.string().max(500).optional(),
});

const updateTimeEntrySchema = z
  .object({
    taskId: idSchema.optional(),
    minutes: z.number().int().positive().optional(),
    date: dateStringSchema.optional(),
    description: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      data.taskId !== undefined ||
      data.minutes !== undefined ||
      data.date !== undefined ||
      data.description !== undefined,
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
  projectId: string;
  projectName: string;
  userId: string;
  isMine: boolean;
};

export type GroupedTimeEntries = {
  date: string;
  totalMinutes: number;
  entries: TimeEntryItem[];
};

export type ProjectTimeSummary = {
  totalMinutes: number;
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
    projectId: string;
    project: { name: string };
    task: { title: string } | null;
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
    projectName: entry.project.name,
    userId: entry.userId,
    isMine: entry.userId === currentUserId,
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
  taskId: string;
  minutes: number;
  date: string;
  description?: string;
}): Promise<ActionResult<TimeEntryItem>> {
  const { tenantId, userId } = await requireAuth();
  const parsed = createTimeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  const db = tenantDb(tenantId);
  const task = await db.task.findUnique({
    where: { id: parsed.data.taskId },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  await requireProject(tenantId, task.project.id, userId);

  const created = await db.timeEntry.create({
    data: {
      taskId: task.id,
      projectId: task.project.id,
      userId,
      minutes: parsed.data.minutes,
      date: new Date(parsed.data.date),
      description: parsed.data.description?.trim() || null,
    },
    include: {
      project: { select: { name: true } },
      task: { select: { title: true } },
    },
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");
  revalidatePath("/[locale]/projects/[projectId]/time", "page");
  revalidatePath("/[locale]/time", "page");

  return { success: true, data: mapEntry(created, userId) };
}

export async function getTimeEntriesByProject(
  projectId: string
): Promise<ActionResult<GroupedTimeEntries[]>> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  const entries = await db.timeEntry.findMany({
    where: { projectId },
    include: {
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const mapped = entries.map((entry) => mapEntry(entry, userId));
  return { success: true, data: groupEntriesByDay(mapped) };
}

export async function getMyTimeEntries(): Promise<ActionResult<TimeEntryItem[]>> {
  const { tenantId, userId } = await requireAuth();
  const db = tenantDb(tenantId);

  const entries = await db.timeEntry.findMany({
    where: { userId },
    include: {
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return {
    success: true,
    data: entries.map((entry) => mapEntry(entry, userId)),
  };
}

export async function updateTimeEntry(
  id: string,
  data: {
    taskId?: string;
    minutes?: number;
    date?: string;
    description?: string;
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

  let targetTaskId = existing.taskId;
  let targetProjectId = existing.projectId;

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

  await requireProject(tenantId, targetProjectId, userId);

  const updated = await db.timeEntry.update({
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
    },
    include: {
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");
  revalidatePath("/[locale]/projects/[projectId]/time", "page");
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
  const existing = await db.timeEntry.findFirst({
    where: { id: parsedId.data, userId },
  });

  if (!existing) {
    return { success: false, error: "TIME_ENTRY_NOT_FOUND" };
  }

  await requireProject(tenantId, existing.projectId, userId);
  await db.timeEntry.delete({ where: { id: existing.id } });

  revalidatePath("/[locale]/projects/[projectId]", "page");
  revalidatePath("/[locale]/projects/[projectId]/time", "page");
  revalidatePath("/[locale]/time", "page");

  return { success: true, data: undefined };
}

export async function getProjectTimeSummary(
  projectId: string
): Promise<ActionResult<ProjectTimeSummary>> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  const entries = await db.timeEntry.findMany({
    where: { projectId },
    include: {
      task: { select: { id: true, title: true } },
    },
    orderBy: { date: "desc" },
  });

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  const taskTotals = new Map<string, { taskId: string; taskTitle: string; totalMinutes: number }>();
  const personTotals = new Map<string, number>();
  const dayTotals = new Map<string, number>();
  const weekTotals = new Map<string, number>();

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

    personTotals.set(entry.userId, (personTotals.get(entry.userId) ?? 0) + entry.minutes);

    const dayKey = toDateKey(entry.date);
    dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + entry.minutes);

    const weekKey = toDateKey(getWeekStart(entry.date));
    weekTotals.set(weekKey, (weekTotals.get(weekKey) ?? 0) + entry.minutes);
  }

  const userIds = Array.from(personTotals.keys());
  const memberships = await db.membership.findMany({
    where: { userId: { in: userIds } },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });
  const userDisplayById = new Map<string, string>();
  for (const membership of memberships) {
    userDisplayById.set(membership.userId, membership.user.name ?? membership.user.email);
  }

  const summary: ProjectTimeSummary = {
    totalMinutes,
    byTask: Array.from(taskTotals.values()).sort((a, b) => b.totalMinutes - a.totalMinutes),
    byPerson: Array.from(personTotals.entries())
      .map(([personId, minutes]) => ({
        userId: personId,
        userName: userDisplayById.get(personId) ?? personId,
        totalMinutes: minutes,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes),
    byDay: Array.from(dayTotals.entries())
      .map(([date, minutes]) => ({ date, totalMinutes: minutes }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    byWeek: Array.from(weekTotals.entries())
      .map(([weekStart, minutes]) => ({ weekStart, totalMinutes: minutes }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
  };

  return { success: true, data: summary };
}
