"use server";

import { z } from "zod";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_ENTITIES,
  type ActivityAction,
  type ActivityEntity,
} from "@/lib/activity-log";

const getActivityLogOptionsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  action: z.enum(ACTIVITY_ACTIONS).optional(),
  entity: z.enum(ACTIVITY_ENTITIES).optional(),
});
const projectIdSchema = z.string().min(1);

export type ActivityLogItem = {
  id: string;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string;
  metadata: unknown;
  createdAt: string;
  projectId: string;
  actorId: string;
  actor: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type ActivityLogResult =
  | {
      success: true;
      items: ActivityLogItem[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }
  | { success: false; error: string };

/**
 * Returns activity logs for a project, tenant-scoped, with filters + pagination.
 */
export async function getActivityLog(
  projectId: string,
  options?: {
    page?: number | string;
    pageSize?: number | string;
    action?: ActivityAction;
    entity?: ActivityEntity;
  }
): Promise<ActivityLogResult> {
  const { tenantId, userId } = await requireAuth();
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    return { success: false, error: "INVALID_PROJECT_ID" };
  }
  await requireProject(tenantId, parsedProjectId.data, userId);

  const parsed = getActivityLogOptionsSchema.safeParse(options ?? {});
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const db = tenantDb(tenantId);
  const where: {
    projectId: string;
    action?: ActivityAction;
    entity?: ActivityEntity;
  } = {
    projectId: parsedProjectId.data,
  };

  if (parsed.data.action) {
    where.action = parsed.data.action;
  }
  if (parsed.data.entity) {
    where.entity = parsed.data.entity;
  }

  const [total, rows] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    success: true,
    items: rows.map((row) => ({
      id: row.id,
      action: row.action as ActivityAction,
      entity: row.entity as ActivityEntity,
      entityId: row.entityId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      projectId: row.projectId,
      actorId: row.actorId,
      actor: row.actor,
    })),
    page,
    pageSize,
    total,
    totalPages,
  };
}
