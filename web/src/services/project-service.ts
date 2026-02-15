import { tenantDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";
import type { TaskStatus } from "../../generated/prisma/client";

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string; // ProjectStatus
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskCount: number;
};

export type ProjectDetailData = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskStatusCounts: { TODO: number; IN_PROGRESS: number; DONE: number };
  members: Array<{
    membershipId: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
  availableMembers: Array<{
    membershipId: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
};

export type GetProjectsOptions = {
  search?: string;
  status?: string;
  includeTaskCount?: boolean;
};

/**
 * Karnlogik for att hamta projektlistor.
 * Actions anvander med includeTaskCount=true.
 * AI-verktyg anvander med includeTaskCount=false.
 */
export async function getProjectsCore(
  ctx: ServiceContext,
  options?: GetProjectsOptions & PaginationOptions
): Promise<ProjectListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId },
    select: { id: true, role: true },
  });
  if (!membership) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (membership.role !== "ADMIN") {
    where.projectMembers = {
      some: { membershipId: membership.id },
    };
  }

  if (options?.status) where.status = options.status;

  if (options?.search?.trim()) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { address: { contains: term, mode: "insensitive" } },
    ];
  }

  const projects = await db.project.findMany({
    where,
    include: options?.includeTaskCount
      ? { _count: { select: { tasks: true } } }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: options?.limit,
    skip: options?.offset,
  });

  return projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    address: p.address,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    taskCount: p._count?.tasks ?? 0,
  }));
}

/**
 * Karnlogik for att hamta detaljerad information om ett projekt.
 * Inkluderar task-raknare per status och medlemmar.
 */
export async function getProjectDetailCore(
  ctx: ServiceContext,
  projectId: string
): Promise<ProjectDetailData | null> {
  const db = tenantDb(ctx.tenantId);

  const project = await db.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return null;
  }

  // Count tasks by status
  const taskCounts = await Promise.all([
    db.task.count({ where: { projectId, status: "TODO" as TaskStatus } }),
    db.task.count({ where: { projectId, status: "IN_PROGRESS" as TaskStatus } }),
    db.task.count({ where: { projectId, status: "DONE" as TaskStatus } }),
  ]);

  const taskStatusCounts = {
    TODO: taskCounts[0],
    IN_PROGRESS: taskCounts[1],
    DONE: taskCounts[2],
  };

  // Project members (memberships explicitly added to this project)
  const projectMemberRows = await db.projectMember.findMany({
    where: { projectId },
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
  });

  const members = projectMemberRows.map((pm: any) => ({
    membershipId: pm.membership.id,
    role: pm.membership.role,
    user: pm.membership.user,
  }));

  // Tenant members not yet on the project (for "add member" dropdown)
  const allMemberships = await db.membership.findMany({
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
  });

  const memberIdsOnProject = new Set(members.map((m) => m.membershipId));
  const availableMembers = allMemberships
    .filter((m) => !memberIdsOnProject.has(m.id))
    .map((m) => ({
      membershipId: m.id,
      role: m.role,
      user: m.user,
    }));

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    address: project.address,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    taskStatusCounts,
    members,
    availableMembers,
  };
}
