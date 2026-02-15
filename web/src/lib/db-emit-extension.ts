import type { EmitContext } from "./emit-context";
import {
  SOCKET_EVENTS,
  projectRoom,
  userRoom,
  tenantRoom,
} from "./socket-events";
import type { Server } from "socket.io";

/** Models that should trigger auto-emit */
const EMIT_MODELS = new Set([
  "task",
  "file",
  "note",
  "comment",
  "timeEntry",
  "notification",
  "noteCategory",
  "project",
  "invitation",
  "membership",
]);

/** Operations to intercept */
const EMIT_OPERATIONS = ["create", "update", "delete", "upsert"] as const;

/**
 * Get Socket.IO server from global scope.
 * Returns null during build or if server not initialized.
 */
function getIO(): Server | null {
  return (
    ((globalThis as Record<string, unknown>).ioServer as Server | null) ?? null
  );
}

/**
 * Capitalize first letter of string.
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Determine event name, target room, and payload for a model+operation.
 * Returns null if the combination should not emit.
 */
function getEventInfo(
  model: string,
  operation: "created" | "updated" | "deleted",
  record: Record<string, unknown>,
  context: EmitContext
): {
  eventName: string;
  room: string;
  payload: Record<string, unknown>;
} | null {
  const eventKey = `${model}${capitalize(operation)}` as keyof typeof SOCKET_EVENTS;
  const eventName = SOCKET_EVENTS[eventKey];
  if (!eventName) return null;

  switch (model) {
    case "task": {
      const pid = context.projectId ?? (record.projectId as string);
      if (!pid) return null;
      return {
        eventName,
        room: projectRoom(pid),
        payload: {
          projectId: pid,
          taskId: record.id as string,
          actorUserId: context.actorUserId,
        },
      };
    }

    case "file": {
      const pid = record.projectId as string | null;
      if (pid) {
        return {
          eventName,
          room: projectRoom(pid),
          payload: {
            projectId: pid,
            fileId: record.id as string,
            actorUserId: context.actorUserId,
            fileName: record.name as string | undefined,
            ocrText: record.ocrText as string | undefined,
            url: record.url as string | undefined,
          },
        };
      }
      // Personal file → user room
      return {
        eventName,
        room: userRoom(context.actorUserId),
        payload: {
          projectId: null,
          fileId: record.id as string,
          actorUserId: context.actorUserId,
          fileName: record.name as string | undefined,
          ocrText: record.ocrText as string | undefined,
          url: record.url as string | undefined,
        },
      };
    }

    case "note": {
      const pid = record.projectId as string | null;
      const createdById =
        (record.createdById as string) ?? context.actorUserId;
      if (pid) {
        return {
          eventName,
          room: projectRoom(pid),
          payload: {
            noteId: record.id as string,
            projectId: pid,
            title: record.title as string,
            category: (record.category as string) ?? null,
            createdById,
          },
        };
      }
      return {
        eventName,
        room: userRoom(createdById),
        payload: {
          noteId: record.id as string,
          projectId: null,
          title: record.title as string,
          category: (record.category as string) ?? null,
          createdById,
        },
      };
    }

    case "comment": {
      const pid = context.projectId;
      if (!pid) {
        console.warn(
          "[auto-emit] Comment emit skipped: missing projectId in context"
        );
        return null;
      }
      return {
        eventName,
        room: projectRoom(pid),
        payload: {
          projectId: pid,
          commentId: record.id as string,
          taskId: record.taskId as string,
          actorUserId: context.actorUserId,
        },
      };
    }

    case "timeEntry": {
      const pid = context.projectId ?? (record.projectId as string);
      if (!pid) return null;
      return {
        eventName,
        room: projectRoom(pid),
        payload: {
          projectId: pid,
          timeEntryId: record.id as string,
          actorUserId: context.actorUserId,
        },
      };
    }

    case "notification": {
      const targetUserId = record.userId as string;
      if (!targetUserId) return null;
      return {
        eventName,
        room: userRoom(targetUserId),
        payload: {
          id: record.id as string,
          title: record.title as string,
          body: record.body as string,
          read: record.read as boolean,
          createdAt:
            (record.createdAt as Date)?.toISOString?.() ??
            new Date().toISOString(),
          projectId: (record.projectId as string) ?? null,
        },
      };
    }

    case "noteCategory": {
      const tid = context.tenantId;
      if (!tid) return null;
      return {
        eventName,
        room: tenantRoom(tid),
        payload: {
          categoryId: record.id as string,
          name: record.name as string,
          slug: record.slug as string,
          color: (record.color as string) ?? null,
        },
      };
    }

    case "project": {
      const tid = context.tenantId;
      if (!tid) return null;
      return {
        eventName,
        room: tenantRoom(tid),
        payload: {
          projectId: record.id as string,
          actorUserId: context.actorUserId,
          ...(record.status ? { newStatus: record.status as string } : {}),
        },
      };
    }

    case "invitation": {
      const tid = context.tenantId ?? (record.tenantId as string);
      if (!tid) return null;
      return {
        eventName,
        room: tenantRoom(tid),
        payload: {
          tenantId: tid,
          invitationId: record.id as string,
          email: record.email as string,
          role: record.role as string,
          status: record.status as string,
          actorUserId: context.actorUserId,
        },
      };
    }

    case "membership": {
      const tid = context.tenantId ?? (record.tenantId as string);
      if (!tid) return null;
      return {
        eventName,
        room: tenantRoom(tid),
        payload: {
          tenantId: tid,
          membershipId: record.id as string,
          userId: record.userId as string,
          role: record.role as string,
          actorUserId: context.actorUserId,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Create a Prisma extension that automatically emits WebSocket events
 * after successful create/update/delete operations.
 *
 * @param context - EmitContext with actor and scope info
 * @returns Prisma extension config (query object)
 */
export function createEmitExtension(context: EmitContext) {
  const query: Record<
    string,
    Record<
      string,
      (params: {
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) => Promise<unknown>
    >
  > = {};

  for (const model of EMIT_MODELS) {
    query[model] = {};

    for (const operation of EMIT_OPERATIONS) {
      query[model][operation] = async ({
        args,
        query: run,
      }: {
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) => {
        // 1. Execute the actual database operation FIRST
        const result = await run(args);

        // 2. Skip emit if context says so
        if (context.skipEmit) return result;

        // 3. Try to emit (fire-and-forget, never throws)
        try {
          const io = getIO();
          if (!io) return result; // No socket server (build time, tests)

          const record = result as Record<string, unknown>;
          const mappedOp: "created" | "updated" | "deleted" =
            operation === "upsert"
              ? "updated"
              : operation === "create"
                ? "created"
                : operation === "update"
                  ? "updated"
                  : "deleted";

          const eventInfo = getEventInfo(model, mappedOp, record, context);
          if (!eventInfo) return result;

          const { eventName, room, payload } = eventInfo;
          io.to(room).emit(eventName, payload);
        } catch (emitError) {
          // Log but never fail the DB operation due to emit issues
          console.warn(
            `[auto-emit] Failed to emit for ${model}.${operation}:`,
            emitError
          );
        }

        return result;
      };
    }
  }

  return { query };
}
