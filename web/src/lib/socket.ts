import { getToken } from "next-auth/jwt";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { requireProject } from "@/lib/auth";
import {
  SOCKET_EVENTS,
  projectRoom,
  tenantRoom,
  userRoom,
  type RealtimeFileEvent,
  type RealtimeNotification,
  type RealtimeProjectUpdatedEvent,
  type RealtimeTaskEvent,
} from "@/lib/socket-events";

type SocketAuthData = {
  tenantId: string;
  userId: string;
  role: string;
};

type ProjectJoinPayload = {
  projectId: string;
};

const projectJoinSchema = z.object({
  projectId: z.string().min(1),
});

declare global {
  // eslint-disable-next-line no-var
  var ioServer: Server | undefined;
}

function getSocketPort(): number {
  const value = process.env.SOCKET_PORT ?? process.env.NEXT_PUBLIC_SOCKET_PORT ?? "3001";
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Invalid SOCKET_PORT");
  }
  return port;
}

function getSocketPath(): string {
  return process.env.SOCKET_PATH ?? process.env.NEXT_PUBLIC_SOCKET_PATH ?? "/socket.io";
}

function getAllowedOrigins(): string[] {
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return appUrl
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function authenticateSocket(socket: Socket): Promise<SocketAuthData> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET_MISSING");

  const authToken =
    typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  const authorizationHeader =
    typeof socket.handshake.headers.authorization === "string"
      ? socket.handshake.headers.authorization
      : authToken
        ? `Bearer ${authToken}`
        : "";
  const cookieHeader =
    typeof socket.handshake.headers.cookie === "string" ? socket.handshake.headers.cookie : "";

  const token = await getToken({
    req: {
      headers: {
        authorization: authorizationHeader,
        cookie: cookieHeader,
      },
    } as never,
    secret,
  });

  if (!token?.sub || typeof token.tenantId !== "string" || typeof token.role !== "string") {
    throw new Error("UNAUTHORIZED");
  }

  return {
    userId: token.sub,
    tenantId: token.tenantId,
    role: token.role,
  };
}

function createSocketServer(): Server {
  const io = new Server(getSocketPort(), {
    path: getSocketPath(),
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const authData = await authenticateSocket(socket);
      socket.data.auth = authData;

      socket.join(tenantRoom(authData.tenantId));
      socket.join(userRoom(authData.userId));
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    socket.on(
      SOCKET_EVENTS.projectJoin,
      async (
        payload: ProjectJoinPayload,
        callback?: (result: { success: boolean; error?: string }) => void
      ) => {
        const parsed = projectJoinSchema.safeParse(payload);
        if (!parsed.success) {
          callback?.({ success: false, error: "INVALID_PROJECT" });
          return;
        }

        const authData = socket.data.auth as SocketAuthData | undefined;
        if (!authData) {
          callback?.({ success: false, error: "UNAUTHORIZED" });
          socket.disconnect(true);
          return;
        }

        try {
          await requireProject(authData.tenantId, parsed.data.projectId, authData.userId);
          socket.join(projectRoom(parsed.data.projectId));
          callback?.({ success: true });
        } catch {
          callback?.({ success: false, error: "FORBIDDEN" });
        }
      }
    );
  });

  return io;
}

export function getSocketServer(): Server {
  if (globalThis.ioServer) return globalThis.ioServer;
  const io = createSocketServer();
  globalThis.ioServer = io;
  return io;
}

export function emitNotificationToUser(userId: string, notification: RealtimeNotification): void {
  const io = getSocketServer();
  io.to(userRoom(userId)).emit(SOCKET_EVENTS.notificationNew, notification);
}

export function emitTaskCreatedToProject(projectId: string, payload: RealtimeTaskEvent): void {
  const io = getSocketServer();
  io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.taskCreated, payload);
}

export function emitTaskUpdatedToProject(projectId: string, payload: RealtimeTaskEvent): void {
  const io = getSocketServer();
  io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.taskUpdated, payload);
}

export function emitTaskDeletedToProject(projectId: string, payload: RealtimeTaskEvent): void {
  const io = getSocketServer();
  io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.taskDeleted, payload);
}

export function emitFileCreatedToProject(projectId: string, payload: RealtimeFileEvent): void {
  const io = getSocketServer();
  io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.fileCreated, payload);
}

export function emitFileDeletedToProject(projectId: string, payload: RealtimeFileEvent): void {
  const io = getSocketServer();
  io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.fileDeleted, payload);
}

export function emitProjectUpdatedToProject(
  projectId: string,
  payload: RealtimeProjectUpdatedEvent
): void {
  const io = getSocketServer();
  io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.projectUpdated, payload);
}
