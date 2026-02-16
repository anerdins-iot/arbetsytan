"use server";

import { requireAuth } from "@/lib/auth";
import { tenantDb, userDb } from "@/lib/db";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type BriefingProjectSummary = {
  name: string;
  status: string;
  taskCount: number;
};

export type BriefingTask = {
  title: string;
  status: string;
  deadline: string | null;
  projectName: string;
};

export type BriefingDeadline = {
  title: string;
  deadline: string;
  projectName: string;
};

export type BriefingNote = {
  title: string;
  updatedAt: string;
};

export type DailyBriefing = {
  projectSummary: BriefingProjectSummary[];
  myTasks: BriefingTask[];
  upcomingDeadlines: BriefingDeadline[];
  recentNotes: BriefingNote[];
  unreadNotifications: number;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fetches the current user's daily briefing: projects, assigned tasks,
 * upcoming deadlines, recent personal notes, and unread notification count.
 * Uses requireAuth and tenantDb for tenant isolation. Kept to minimal queries.
 */
export async function getDailyBriefing(): Promise<DailyBriefing> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  // 1) Membership (needed for task assignments)
  const membership = await db.membership.findFirst({
    where: { userId },
  });

  if (!membership) {
    // Still return projects and unread count; notes are user-scoped
    const [projects, unreadCount, recentNotes] = await Promise.all([
      db.project.findMany({
        select: { name: true, status: true, _count: { select: { tasks: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      db.notification.count({ where: { userId, read: false } }),
      userDb(userId, {}).note.findMany({
        select: { title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      projectSummary: projects.map((p) => ({
        name: p.name,
        status: p.status,
        taskCount: p._count.tasks,
      })),
      myTasks: [],
      upcomingDeadlines: [],
      recentNotes: recentNotes.map((n) => ({
        title: n.title,
        updatedAt: n.updatedAt.toISOString(),
      })),
      unreadNotifications: unreadCount,
    };
  }

  const now = new Date();
  const inSevenDays = new Date(now.getTime() + SEVEN_DAYS_MS);

  // 2–4) Projects, assigned tasks, unread count, and personal notes (parallel)
  const [projects, assignments, unreadCount, recentNotes] = await Promise.all([
    db.project.findMany({
      select: { name: true, status: true, _count: { select: { tasks: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.taskAssignment.findMany({
      where: { membershipId: membership.id },
      include: {
        task: {
          include: {
            project: { select: { name: true } },
          },
        },
      },
      orderBy: { task: { updatedAt: "desc" } },
      take: 30,
    }),
    db.notification.count({ where: { userId, read: false } }),
    userDb(userId, {}).note.findMany({
      select: { title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const myTasks: BriefingTask[] = assignments.slice(0, 10).map((a) => ({
    title: a.task.title,
    status: a.task.status,
    deadline: a.task.deadline?.toISOString() ?? null,
    projectName: a.task.project.name,
  }));

  const upcomingDeadlines: BriefingDeadline[] = assignments
    .filter((a) => {
      const d = a.task.deadline;
      return d && d >= now && d <= inSevenDays;
    })
    .map((a) => ({
      title: a.task.title,
      deadline: a.task.deadline!.toISOString(),
      projectName: a.task.project.name,
    }))
    .sort((x, y) => new Date(x.deadline).getTime() - new Date(y.deadline).getTime());

  return {
    projectSummary: projects.map((p) => ({
      name: p.name,
      status: p.status,
      taskCount: p._count.tasks,
    })),
    myTasks,
    upcomingDeadlines,
    recentNotes: recentNotes.map((n) => ({
      title: n.title,
      updatedAt: n.updatedAt.toISOString(),
    })),
    unreadNotifications: unreadCount,
  };
}
