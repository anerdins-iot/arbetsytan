"use server";

import type { Prisma } from "../../generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  projectId: string;
  projectName: string;
};

export type DashboardActivity = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
  projectId: string;
  projectName: string;
  actorId: string;
  actorName: string | null;
};

export type DashboardNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  projectId: string | null;
};

/** Fetch tasks assigned to the current user across all their projects in the tenant. */
export async function getMyTasks(): Promise<{
  tasks: DashboardTask[];
  error?: string;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  // Get the user's membership in this tenant
  const membership = await db.membership.findFirst({
    where: { userId },
  });

  if (!membership) {
    return { tasks: [] };
  }

  // Get tasks assigned to this user via TaskAssignment, through tenant's projects
  // Uses tenantDb which automatically filters via task.project.tenantId
  const assignments = await db.taskAssignment.findMany({
    where: {
      membershipId: membership.id,
    },
    include: {
      task: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { task: { deadline: { sort: "asc", nulls: "last" } } },
  });

  const tasks: DashboardTask[] = assignments.map((a) => ({
    id: a.task.id,
    title: a.task.title,
    status: a.task.status,
    priority: a.task.priority,
    deadline: a.task.deadline?.toISOString() ?? null,
    projectId: a.task.project.id,
    projectName: a.task.project.name,
  }));

  return { tasks };
}

/** Fetch tasks assigned to the current user that are due today or overdue. */
export async function getMyTasksToday(): Promise<{
  tasks: DashboardTask[];
  error?: string;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const membership = await db.membership.findFirst({
    where: { userId },
  });

  if (!membership) {
    return { tasks: [] };
  }

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const assignments = await db.taskAssignment.findMany({
    where: {
      membershipId: membership.id,
      task: {
        status: { not: "DONE" },
        OR: [
          { deadline: { lte: endOfDay } },
          { deadline: null },
        ],
      },
    },
    include: {
      task: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { task: { deadline: { sort: "asc", nulls: "last" } } },
  });

  const tasks: DashboardTask[] = assignments.map((a) => ({
    id: a.task.id,
    title: a.task.title,
    status: a.task.status,
    priority: a.task.priority,
    deadline: a.task.deadline?.toISOString() ?? null,
    projectId: a.task.project.id,
    projectName: a.task.project.name,
  }));

  return { tasks };
}

/** Fetch recent activity in the user's projects only (projects where the user has task assignments). */
export async function getRecentActivity(): Promise<{
  activities: DashboardActivity[];
  error?: string;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const membership = await db.membership.findFirst({
    where: { userId },
  });
  if (!membership) {
    return { activities: [] };
  }

  // Project IDs where the user is assigned to at least one task (user's projects)
  const assignments = await db.taskAssignment.findMany({
    where: { membershipId: membership.id },
    select: { task: { select: { projectId: true } } },
  });
  const projectIds = [...new Set(assignments.map((a) => a.task.projectId))];
  if (projectIds.length === 0) {
    return { activities: [] };
  }

  const args: Prisma.ActivityLogFindManyArgs = {
    where: { projectId: { in: projectIds } },
    include: {
      project: { select: { id: true, name: true } },
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  };
  const logs = await db.activityLog.findMany(args);

  const activities: DashboardActivity[] = logs.map((log) => {
    const withRelations = log as typeof log & { project: { name: string }; actor: { name: string } | null };
    return {
      id: withRelations.id,
      action: withRelations.action,
      entity: withRelations.entity,
      entityId: withRelations.entityId,
      metadata: withRelations.metadata,
      createdAt: withRelations.createdAt.toISOString(),
      projectId: withRelations.projectId,
      projectName: withRelations.project.name,
      actorId: withRelations.actorId,
      actorName: withRelations.actor?.name ?? null,
    };
  });

  return { activities };
}

/** Fetch unread and recent notifications for the current user. */
export async function getMyNotifications(): Promise<{
  notifications: DashboardNotification[];
  error?: string;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  // Use tenantDb to ensure we only get notifications for the current tenant's projects
  const notifications = await db.notification.findMany({
    where: {
      userId,
      channel: "IN_APP",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      projectId: n.projectId,
    })),
  };
}

/** Mark a notification as read. */
export async function markNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  await db.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: { read: true },
  });

  return { success: true };
}

/** Mark all notifications as read for the current user. */
export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  error?: string;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  await db.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: { read: true },
  });

  return { success: true };
}
