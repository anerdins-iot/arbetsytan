"use server";

import { z } from "zod";
import type { TaskStatus } from "../../generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { searchDocumentsGlobal } from "@/lib/ai/embeddings";
import { logger } from "@/lib/logger";

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

export type GlobalSearchFileResult = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
};

export type GlobalSearchDocumentResult = {
  chunkId: string;
  content: string;
  similarity: number;
  page: number | null;
  fileId: string;
  fileName: string;
  projectId: string;
  projectName: string;
};

export type GlobalSearchResult = {
  projects: GlobalSearchProjectResult[];
  tasks: GlobalSearchTaskResult[];
  files: GlobalSearchFileResult[];
  documents: GlobalSearchDocumentResult[];
};

/**
 * Search projects, tasks, files and document content available to the current user.
 * Results are always tenant scoped and limited to projects where the user is a member.
 * File name search uses standard text matching.
 * Document content search uses embeddings (semantic search) via pgvector when available.
 */
export async function globalSearch(input: { query: string }): Promise<GlobalSearchResult> {
  const { tenantId, userId } = await requireAuth();
  const parsed = globalSearchSchema.safeParse(input);

  if (!parsed.success) {
    return { projects: [], tasks: [], files: [], documents: [] };
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

  const [projects, tasks, files] = await Promise.all([
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
    db.file.findMany({
      where: {
        project: memberProjectFilter,
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  // Attempt embeddings search for document content (gracefully degrade if unavailable)
  let documents: GlobalSearchDocumentResult[] = [];
  if (process.env.OPENAI_API_KEY) {
    try {
      // Get accessible project IDs for the user
      const accessibleProjects = await db.project.findMany({
        where: memberProjectFilter,
        select: { id: true },
      });
      const accessibleProjectIds = accessibleProjects.map((p) => p.id);

      if (accessibleProjectIds.length > 0) {
        const docResults = await searchDocumentsGlobal(
          tenantId,
          accessibleProjectIds,
          query,
          { limit: 5, threshold: 0.5 }
        );

        documents = docResults.map((doc) => ({
          chunkId: doc.id,
          content: doc.content.length > 200 ? doc.content.slice(0, 200) + "..." : doc.content,
          similarity: doc.similarity,
          page: doc.page,
          fileId: doc.fileId,
          fileName: doc.fileName,
          projectId: doc.projectId,
          projectName: doc.projectName,
        }));
      }
    } catch (error) {
      logger.warn("Embeddings search failed, returning results without document content", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      projectId: file.project.id,
      projectName: file.project.name,
    })),
    documents,
  };
}
