"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import type { ProjectStatus, TaskStatus } from "../../generated/prisma/client";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]),
});

export type ProjectActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ProjectWithCounts = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    tasks: number;
  };
};

export type GetProjectsResult = {
  projects: ProjectWithCounts[];
};

/**
 * Get all projects for the current tenant, with optional search and status filter.
 */
export async function getProjects(options?: {
  search?: string;
  status?: ProjectStatus;
}): Promise<GetProjectsResult> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const where: Record<string, unknown> = {};

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.search && options.search.trim().length > 0) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { address: { contains: term, mode: "insensitive" } },
    ];
  }

  const projects = await db.project.findMany({
    where,
    include: {
      _count: {
        select: { tasks: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return { projects: projects as ProjectWithCounts[] };
}

/**
 * Create a new project for the current tenant.
 */
export async function createProject(
  formData: FormData
): Promise<ProjectActionResult> {
  const { tenantId } = await requireAuth();

  const raw = {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    address: formData.get("address") || undefined,
  };

  const result = createProjectSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { name, description, address } = result.data;
  const db = tenantDb(tenantId);

  await db.project.create({
    data: {
      name,
      description: description ?? null,
      address: address ?? null,
      tenant: { connect: { id: tenantId } },
    },
  });

  revalidatePath("/[locale]/projects", "page");

  return { success: true };
}

// ─────────────────────────────────────────
// Project detail types
// ─────────────────────────────────────────

export type TaskStatusCounts = {
  TODO: number;
  IN_PROGRESS: number;
  DONE: number;
};

export type ProjectMember = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskStatusCounts: TaskStatusCounts;
  members: ProjectMember[];
};

export type GetProjectResult =
  | { success: true; project: ProjectDetail }
  | { success: false; error: string };

/**
 * Get a single project with task counts by status and team members.
 * Requires auth + project access check.
 */
export async function getProject(
  projectId: string
): Promise<GetProjectResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  const project = await db.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return { success: false, error: "PROJECT_NOT_FOUND" };
  }

  // Count tasks by status
  const taskCounts = await Promise.all([
    db.task.count({ where: { projectId, status: "TODO" as TaskStatus } }),
    db.task.count({ where: { projectId, status: "IN_PROGRESS" as TaskStatus } }),
    db.task.count({ where: { projectId, status: "DONE" as TaskStatus } }),
  ]);

  const taskStatusCounts: TaskStatusCounts = {
    TODO: taskCounts[0],
    IN_PROGRESS: taskCounts[1],
    DONE: taskCounts[2],
  };

  // Get tenant members (all tenant members are potential project participants)
  const memberships = await db.membership.findMany({
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

  const members: ProjectMember[] = memberships.map((m) => ({
    id: m.id,
    role: m.role,
    user: m.user,
  }));

  return {
    success: true,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      address: project.address,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      taskStatusCounts,
      members,
    },
  };
}

/**
 * Update project info (name, description, address, status).
 * Requires auth + project access check.
 */
export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<ProjectActionResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const raw = {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    address: formData.get("address") || undefined,
    status: formData.get("status"),
  };

  const result = updateProjectSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { name, description, address, status } = result.data;
  const db = tenantDb(tenantId);

  await db.project.update({
    where: { id: projectId },
    data: {
      name,
      description: description ?? null,
      address: address ?? null,
      status: status as ProjectStatus,
    },
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");
  revalidatePath("/[locale]/projects", "page");

  return { success: true };
}
