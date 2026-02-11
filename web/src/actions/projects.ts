"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import type { ProjectStatus } from "../../generated/prisma/client";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
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
