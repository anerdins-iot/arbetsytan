import { tenantDb, prisma } from "@/lib/db";
import type { ServiceContext } from "./types";

export type CommentListItem = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

/**
 * Hamta kommentarer for en task.
 * Verifierar att tasken tillhor projektet.
 * Hamtar author-info fran platform-level User-tabellen.
 */
export async function getCommentsCore(
  ctx: ServiceContext,
  projectId: string,
  taskId: string
): Promise<{ comments: CommentListItem[] } | { error: string }> {
  const db = tenantDb(ctx.tenantId);

  // Verifiera att task tillhor projekt
  const task = await db.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true },
  });
  if (!task) return { error: "TASK_NOT_FOUND" };

  const comments = await db.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });

  // Hamta author-info separat (User ar platform-level, inte tenant-level)
  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    comments: comments.map((c) => {
      const author = userMap.get(c.authorId);
      return {
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        authorId: c.authorId,
        author: author ?? {
          id: c.authorId,
          name: null,
          email: "unknown",
          image: null,
        },
      };
    }),
  };
}
