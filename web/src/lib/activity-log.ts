import { tenantDb } from "@/lib/db";
import type { Prisma } from "../../generated/prisma/client";

export const ACTIVITY_ACTIONS = [
  "created",
  "updated",
  "deleted",
  "completed",
  "assigned",
  "uploaded",
  "statusChanged",
  "added",
  "removed",
] as const;

export const ACTIVITY_ENTITIES = [
  "task",
  "project",
  "file",
  "member",
  "comment",
  "note",
  "timeEntry",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export { formatActivityMetadata } from "./format-activity-metadata";

/**
 * Creates an activity log entry scoped to tenant + project.
 * Call this from server actions when a meaningful project event happens.
 */
export async function logActivity(
  tenantId: string,
  projectId: string,
  actorId: string,
  action: ActivityAction,
  entityType: ActivityEntity,
  entityId: string,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  const db = tenantDb(tenantId);

  await db.activityLog.create({
    data: {
      action,
      entity: entityType,
      entityId,
      metadata: metadata ?? {},
      project: { connect: { id: projectId } },
      actor: { connect: { id: actorId } },
    },
  });
}
