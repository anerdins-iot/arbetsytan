"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { createNotification } from "@/actions/notifications";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type GetCommentsResult =
  | { success: true; comments: CommentItem[] }
  | { success: false; error: string };

export type CommentActionResult = {
  success: boolean;
  error?: string;
};

export type GetCommentsByTaskResult =
  | { success: true; commentsByTaskId: Record<string, CommentItem[]> }
  | { success: false; error: string };

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const createCommentSchema = z.object({
  taskId: z.string().min(1),
  content: z.string().min(1).max(5000),
});

const updateCommentSchema = z.object({
  commentId: z.string().min(1),
  content: z.string().min(1).max(5000),
});

const deleteCommentSchema = z.object({
  commentId: z.string().min(1),
});

// ─────────────────────────────────────────
// Server Actions
// ─────────────────────────────────────────

/**
 * Get all comments for a task, ordered chronologically.
 * Requires auth + project access check.
 */
export async function getComments(
  projectId: string,
  taskId: string
): Promise<GetCommentsResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  // Verify task belongs to project
  const task = await db.task.findFirst({
    where: { id: taskId, projectId },
  });
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  const comments = await db.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });

  // Fetch author info for all comments
  // Comments have authorId but no relation to User (since User is platform-level)
  // We need to query users separately
  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const { prisma } = await import("@/lib/db");
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const mapped: CommentItem[] = comments.map((c) => {
    const author = userMap.get(c.authorId);
    return {
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      authorId: c.authorId,
      author: author ?? {
        id: c.authorId,
        name: null,
        email: "unknown",
        image: null,
      },
    };
  });

  return { success: true, comments: mapped };
}

/**
 * Get comments for multiple tasks in one request.
 * Used by Server Components to avoid client-side data fetching in effects.
 */
export async function getCommentsByTask(
  projectId: string,
  taskIds: string[]
): Promise<GetCommentsByTaskResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);
  const db = tenantDb(tenantId);

  if (taskIds.length === 0) {
    return { success: true, commentsByTaskId: {} };
  }

  const uniqueTaskIds = [...new Set(taskIds)];
  const tasks = await db.task.findMany({
    where: { id: { in: uniqueTaskIds }, projectId },
    select: { id: true },
  });

  if (tasks.length !== uniqueTaskIds.length) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  const comments = await db.comment.findMany({
    where: { taskId: { in: uniqueTaskIds } },
    orderBy: { createdAt: "asc" },
  });

  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const { prisma } = await import("@/lib/db");
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const commentsByTaskId: Record<string, CommentItem[]> = {};
  for (const taskId of uniqueTaskIds) {
    commentsByTaskId[taskId] = [];
  }

  for (const comment of comments) {
    const author = userMap.get(comment.authorId);
    commentsByTaskId[comment.taskId].push({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      authorId: comment.authorId,
      author: author ?? {
        id: comment.authorId,
        name: null,
        email: "unknown",
        image: null,
      },
    });
  }

  return { success: true, commentsByTaskId };
}

/**
 * Create a new comment on a task.
 * Requires auth + project access check + Zod validation.
 * Triggers notification placeholder for task assignees.
 */
export async function createComment(
  projectId: string,
  data: { taskId: string; content: string }
): Promise<CommentActionResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const parsed = createCommentSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId);

  // Verify task belongs to project
  const task = await db.task.findFirst({
    where: { id: parsed.data.taskId, projectId },
    include: {
      assignments: {
        include: {
          membership: {
            select: { userId: true },
          },
        },
      },
    },
  });
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  await db.comment.create({
    data: {
      content: parsed.data.content,
      authorId: userId,
      task: { connect: { id: parsed.data.taskId } },
    },
  });

  // Notify assigned users (except the commenter)
  for (const assignment of task.assignments) {
    if (assignment.membership.userId !== userId) {
      await createNotification({
        userId: assignment.membership.userId,
        tenantId,
        projectId,
        titleKey: "notifications.newComment.title",
        bodyKey: "notifications.newComment.body",
        params: { taskTitle: task.title },
      });
    }
  }

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Update a comment. Only the author can update their own comment.
 * Requires auth + project access check + Zod validation.
 */
export async function updateComment(
  projectId: string,
  data: { commentId: string; content: string }
): Promise<CommentActionResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const parsed = updateCommentSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId);

  const comment = await db.comment.findFirst({
    where: { id: parsed.data.commentId },
  });
  if (!comment) {
    return { success: false, error: "COMMENT_NOT_FOUND" };
  }

  // Only the author can edit their comment
  if (comment.authorId !== userId) {
    return { success: false, error: "FORBIDDEN" };
  }

  await db.comment.update({
    where: { id: parsed.data.commentId },
    data: { content: parsed.data.content },
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}

/**
 * Delete a comment. Only the author can delete their own comment.
 * Requires auth + project access check + Zod validation.
 */
export async function deleteComment(
  projectId: string,
  data: { commentId: string }
): Promise<CommentActionResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const parsed = deleteCommentSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId);

  const comment = await db.comment.findFirst({
    where: { id: parsed.data.commentId },
  });
  if (!comment) {
    return { success: false, error: "COMMENT_NOT_FOUND" };
  }

  // Only the author can delete their comment
  if (comment.authorId !== userId) {
    return { success: false, error: "FORBIDDEN" };
  }

  await db.comment.delete({
    where: { id: parsed.data.commentId },
  });

  revalidatePath("/[locale]/projects/[projectId]", "page");

  return { success: true };
}
