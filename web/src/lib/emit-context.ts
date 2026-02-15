/**
 * Context for automatic WebSocket event emission.
 * Passed to tenantDb() and userDb() to enable auto-emit on CRUD operations.
 *
 * When provided, the Prisma client will automatically emit Socket.IO events
 * after successful create/update/delete operations on supported models.
 */
export type EmitContext = {
  /** The user performing the operation. Used as actorUserId in all event payloads. */
  actorUserId: string;

  /**
   * Project scope. Required for project-scoped operations (tasks, comments, time entries).
   * For models like File/Note that can be personal OR project-scoped,
   * this determines whether to emit to project room or user room.
   */
  projectId?: string;

  /**
   * Tenant scope. Auto-filled by tenantDb() — callers should NOT set this manually.
   * Used for tenant-wide events (NoteCategory, Project).
   */
  tenantId?: string;

  /**
   * Disable auto-emit entirely. Use for batch operations, migrations, seed scripts,
   * or any context where WebSocket events are undesirable.
   * @default false
   */
  skipEmit?: boolean;
};

/**
 * Determine the target room for a model based on context and record data.
 * Implementation will be completed in Block 2.1.
 *
 * @param model - Prisma model name (lowercase)
 * @param context - EmitContext with actor and scope info
 * @param record - The database record (result of create/update/delete)
 * @returns Room name (e.g., "project:abc123") or null if emit should be skipped
 */
export function getTargetRoom(
  model: string,
  context: EmitContext,
  record: Record<string, unknown>
): string | null {
  // Placeholder — full implementation in Block 2.1
  return null;
}

/**
 * Create a minimal payload for a WebSocket event.
 * Implementation will be completed in Block 2.1.
 *
 * @param model - Prisma model name (lowercase)
 * @param operation - The CRUD operation type
 * @param record - The database record
 * @param context - EmitContext with actor info
 * @returns Event payload object
 */
export function createEventPayload(
  model: string,
  operation: "created" | "updated" | "deleted",
  record: Record<string, unknown>,
  context: EmitContext
): Record<string, unknown> {
  // Placeholder — full implementation in Block 2.1
  return {};
}
