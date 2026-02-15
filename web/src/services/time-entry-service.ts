import { tenantDb, prisma } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type TimeEntryListItem = {
  id: string;
  description: string | null;
  minutes: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string;
  projectName: string;
  userId: string;
  userName: string;
};

export type TimeSummaryData = {
  totalMinutes: number;
  byTask: Array<{ taskId: string; taskTitle: string; totalMinutes: number }>;
  byPerson: Array<{ userId: string; userName: string; totalMinutes: number }>;
  byDay: Array<{ date: string; totalMinutes: number }>;
  byWeek: Array<{ weekStart: string; totalMinutes: number }>;
};

/**
 * Formatera datum till "YYYY-MM-DD".
 */
export function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Hamta startdatumet for veckan (mandag).
 */
export function getWeekStart(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + mondayOffset);
  return copy;
}

/**
 * Hamta tidsposter for ett projekt.
 */
export async function getTimeEntriesCore(
  ctx: ServiceContext,
  projectId: string,
  options?: PaginationOptions
): Promise<TimeEntryListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const entries = await db.timeEntry.findMany({
    where: { projectId },
    include: {
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: options?.limit,
    skip: options?.offset,
  });

  // Hamta user-info separat (User ar platform-level)
  const userIds = [...new Set(entries.map((e) => e.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return entries.map((e) => ({
    id: e.id,
    description: e.description,
    minutes: e.minutes,
    date: e.date,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    taskId: e.taskId,
    taskTitle: e.task?.title ?? null,
    projectId: e.projectId,
    projectName: e.project.name,
    userId: e.userId,
    userName: userMap.get(e.userId) ?? e.userId,
  }));
}

/**
 * Hamta anvandarens egna tidsposter (cross-project).
 */
export async function getMyTimeEntriesCore(
  ctx: ServiceContext,
  options?: PaginationOptions
): Promise<TimeEntryListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const entries = await db.timeEntry.findMany({
    where: { userId: ctx.userId },
    include: {
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: options?.limit,
    skip: options?.offset,
  });

  // Hamta user-info (for konsekvent userName)
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true },
  });
  const userName = user ? (user.name ?? user.email) : ctx.userId;

  return entries.map((e) => ({
    id: e.id,
    description: e.description,
    minutes: e.minutes,
    date: e.date,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    taskId: e.taskId,
    taskTitle: e.task?.title ?? null,
    projectId: e.projectId,
    projectName: e.project.name,
    userId: e.userId,
    userName,
  }));
}

/**
 * Hamta sammanfattning av tid for ett projekt.
 */
export async function getTimeSummaryCore(
  ctx: ServiceContext,
  projectId: string
): Promise<TimeSummaryData> {
  const db = tenantDb(ctx.tenantId);

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

  // Hamta user-info for person-sammanfattning
  const userIds = Array.from(personTotals.keys());
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return {
    totalMinutes,
    byTask: Array.from(taskTotals.values()).sort((a, b) => b.totalMinutes - a.totalMinutes),
    byPerson: Array.from(personTotals.entries())
      .map(([userId, minutes]) => ({
        userId,
        userName: userMap.get(userId) ?? userId,
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
}
