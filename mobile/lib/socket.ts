import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "./token-storage";

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? "http://localhost:3001";
const SOCKET_PATH = process.env.EXPO_PUBLIC_SOCKET_PATH ?? "/socket.io";

export const SOCKET_EVENTS = {
  notificationNew: "notification:new",
  projectJoin: "project:join",
  taskCreated: "task:created",
  taskUpdated: "task:updated",
  taskDeleted: "task:deleted",
  fileCreated: "file:created",
  fileDeleted: "file:deleted",
  projectUpdated: "project:updated",
} as const;

export type RealtimeNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  projectId: string | null;
};

export type RealtimeTaskEvent = {
  projectId: string;
  taskId: string;
  actorUserId: string;
};

export type RealtimeFileEvent = {
  projectId: string;
  fileId: string;
  actorUserId: string;
};

export type RealtimeProjectUpdatedEvent = {
  projectId: string;
  actorUserId: string;
  previousStatus: string;
  newStatus: string;
};

let socket: Socket | null = null;

/**
 * Connect to Socket.IO server with JWT authentication.
 * Call this after successful login.
 */
export async function connectSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;

  const token = await getAccessToken();
  if (!token) return null;

  socket = io(SOCKET_URL, {
    path: SOCKET_PATH,
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on("connect", () => {
    console.log("[socket] Connected");
  });

  socket.on("connect_error", (err) => {
    console.log("[socket] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[socket] Disconnected:", reason);
  });

  return socket;
}

/**
 * Disconnect from Socket.IO server.
 * Call this on logout.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Join a project room to receive project-specific events.
 * Server validates access via requireProject().
 */
export function joinProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ success: false, error: "NOT_CONNECTED" });
      return;
    }

    socket.emit(
      SOCKET_EVENTS.projectJoin,
      { projectId },
      (result: { success: boolean; error?: string }) => {
        resolve(result);
      }
    );
  });
}
