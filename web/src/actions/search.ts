"use server";

import { z } from "zod";
import type { TaskStatus } from "../../generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

const globalSearchSchema = z.object({
  query: z.string().trim().min(2).max(100),
});

export type GlobalSearchProjectResult = {
  id: string;
  name: string;
  description: string | null;
};

export type GlobalSearchTaskResult = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  projectId: string;
  projectName: string;
};

export type GlobalSearchResult = {
  projects: GlobalSearchProjectResult[];
  tasks: GlobalSearchTaskResult[];
};

/**
 * Search projects and tasks available to the current user.
 * Results are always tenant scoped and limited to projects where the user is a member.
 */
export async function globalSearch(input: { query: string }): Promise<GlobalSearchResult> {
  const { tenantId, userId } = await requireAuth();
  const parsed = globalSearchSchema.safeParse(input);

  if (!parsed.success) {
    return { projects: [], tasks: [] };
  }

  const db = tenantDb(tenantId);
  const query = parsed.data.query;
  const memberProjectFilter = {
    projectMembers: {
      some: {
        membership: {
          userId,
        },
      },
    },
  };

  const [projects, tasks] = await Promise.all([
    db.project.findMany({
      where: {
        ...memberProjectFilter,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.task.findMany({
      where: {
        project: memberProjectFilter,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ]);

  return {
    projects,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      projectId: task.project.id,
      projectName: task.project.name,
    })),
  };
}
