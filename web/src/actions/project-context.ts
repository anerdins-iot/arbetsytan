"use server";

import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

export type ProjectContextProject = {
  name: string;
  status: string;
  address: string | null;
  description: string | null;
};

export type ProjectContextTaskStats = {
  todo: number;
  inProgress: number;
  done: number;
  total: number;
};

export type ProjectContextUpcomingDeadline = {
  title: string;
  deadline: string;
  assigneeName: string | null;
};

export type ProjectContextRecentActivity = {
  action: string;
  entityType: string;
  createdAt: string;
  userName: string | null;
};

export type ProjectContextMembers = {
  count: number;
  names: string[];
};

export type ProjectContextResult = {
  project: ProjectContextProject;
  taskStats: ProjectContextTaskStats;
  upcomingDeadlines: ProjectContextUpcomingDeadline[];
  recentActivity: ProjectContextRecentActivity[];
  members: ProjectContextMembers;
};

/**
 * Fetches rich context for a project: basic info, task stats, upcoming deadlines,
 * recent activity, and members. Uses requireAuth + requireProject and tenantDb.
 */
export async function getProjectContext(
  projectId: string
): Promise<ProjectContextResult> {
  const { tenantId, userId } = await requireAuth();
  const project = await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const [taskCounts, upcomingTasks, recentActivity, membersList, membersCount] =
    await Promise.all([
      db.task.groupBy({
        by: ["status"],
        where: { projectId },
        _count: { id: true },
      }),
      db.task.findMany({
        where: {
          projectId,
          deadline: {
            gte: now,
            lte: sevenDaysFromNow,
          },
        },
        orderBy: { deadline: "asc" },
        take: 5,
        select: {
          title: true,
          deadline: true,
          assignments: {
            take: 1,
            select: {
              membership: {
                select: {
                  user: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      db.activityLog.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          action: true,
          entity: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
      db.projectMember.findMany({
        where: { projectId },
        take: 5,
        select: {
          membership: {
            select: {
              user: { select: { name: true } },
            },
          },
        },
      }),
      db.projectMember.count({ where: { projectId } }),
    ]);

  const statusCounts = {
    TODO: 0,
    IN_PROGRESS: 0,
    DONE: 0,
  };
  let total = 0;
  for (const row of taskCounts) {
    statusCounts[row.status as keyof typeof statusCounts] = row._count.id;
    total += row._count.id;
  }

  const upcomingDeadlines: ProjectContextUpcomingDeadline[] = upcomingTasks.map(
    (t) => ({
      title: t.title,
      deadline: t.deadline!.toISOString(),
      assigneeName:
        t.assignments[0]?.membership?.user?.name ?? null,
    })
  );

  const recentActivityFormatted: ProjectContextRecentActivity[] =
    recentActivity.map((a) => ({
      action: a.action,
      entityType: a.entity,
      createdAt: a.createdAt.toISOString(),
      userName: a.actor?.name ?? null,
    }));

  const memberNames = membersList
    .map((m) => m.membership?.user?.name ?? null)
    .filter((n): n is string => n != null && n.trim() !== "");

  return {
    project: {
      name: project.name,
      status: project.status,
      address: project.address ?? null,
      description: project.description ?? null,
    },
    taskStats: {
      todo: statusCounts.TODO,
      inProgress: statusCounts.IN_PROGRESS,
      done: statusCounts.DONE,
      total,
    },
    upcomingDeadlines,
    recentActivity: recentActivityFormatted,
    members: {
      count: membersCount,
      names: memberNames,
    },
  };
}
