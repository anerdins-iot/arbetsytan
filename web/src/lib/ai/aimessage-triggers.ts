/**
 * Triggers for PROJECT_TO_PERSONAL AIMessages.
 * Called when: task assigned, deadline changed, file uploaded, project status changed.
 * All calls must use tenantDb(tenantId) — caller is responsible for auth and tenant context.
 */
import type { TenantScopedClient } from "@/lib/db";

export type SendProjectToPersonalOptions = {
  db: TenantScopedClient;
  projectId: string;
  userId: string;
  type: string;
  content: string;
  parentId?: string | null;
};

export function sendProjectToPersonalAIMessage(opts: SendProjectToPersonalOptions): Promise<unknown> {
  const { db, projectId, userId, type, content, parentId } = opts;
  return db.aIMessage.create({
    data: {
      direction: "PROJECT_TO_PERSONAL",
      type,
      content,
      read: false,
      userId,
      projectId,
      parentId: parentId ?? null,
    },
  });
}
