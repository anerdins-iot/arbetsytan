import { tenantDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type TaskListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  projectName?: string;
  assignments: Array<{
    membershipId: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
};

export type GetTasksOptions = {
  includeProject?: boolean;
};

/**
 * Core logic for fetching project tasks.
 * Used by both Actions and AI tools.
 */
export async function getProjectTasksCore(
  ctx: ServiceContext,
  projectId: string,
  options?: GetTasksOptions & PaginationOptions
): Promise<TaskListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const tasks = await db.task.findMany({
    where: { projectId },
    include: {
      project: options?.includeProject ? { select: { name: true } } : false,
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
    } as any, // Cast to any because Prisma include types can be tricky with dynamic objects
    orderBy: { createdAt: "desc" },
    take: options?.limit,
    skip: options?.offset,
  });

  return tasks.map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    projectId: t.projectId,
    projectName: t.project?.name,
    assignments: t.assignments.map((a: any) => ({
      membershipId: a.membershipId,
      user: a.membership.user,
    })),
  }));
}

/**
 * Core logic for fetching user tasks across all projects.
 * Primarily used by AI tools.
 */
export async function getUserTasksCore(
  ctx: ServiceContext,
  options?: PaginationOptions
): Promise<TaskListItem[]> {
  const db = tenantDb(ctx.tenantId);

  // 1. Get project IDs where the user is a member
  const projectMemberships = await db.projectMember.findMany({
    where: { membership: { userId: ctx.userId } },
    select: { projectId: true },
  });

  const projectIds = projectMemberships.map((pm) => pm.projectId);
  if (projectIds.length === 0) return [];

  // 2. Fetch tasks from those projects
  const tasks = await db.task.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      project: { select: { name: true } },
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
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    take: options?.limit ?? 30,
    skip: options?.offset,
  });

  return tasks.map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    projectId: t.projectId,
    projectName: t.project.name,
    assignments: t.assignments.map((a: any) => ({
      membershipId: a.membershipId,
      user: a.membership.user,
    })),
  }));
}
