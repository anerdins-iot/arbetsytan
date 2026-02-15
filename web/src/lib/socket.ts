import { getToken } from "next-auth/jwt";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { z } from "zod";
import { requireProject } from "@/lib/auth";
import { verifyAccessToken } from "@/lib/auth-mobile";
import { SOCKET_EVENTS, projectRoom, tenantRoom, userRoom } from "@/lib/socket-events";

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
  const origins = appUrl
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin.length > 0);

  // In development, also allow common localhost variations if not already present
  if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
    const devOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
    devOrigins.forEach((origin) => {
      if (!origins.includes(origin)) {
        origins.push(origin);
      }
    });
  }

  return origins;
}

async function authenticateSocket(socket: Socket): Promise<SocketAuthData> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("Socket Auth Error: AUTH_SECRET is missing");
    throw new Error("AUTH_SECRET_MISSING");
  }

  const authToken =
    typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;

  // Try mobile JWT first (sent via handshake auth.token)
  if (authToken) {
    const mobilePayload = verifyAccessToken(authToken);
    if (mobilePayload) {
      return {
        userId: mobilePayload.userId,
        tenantId: mobilePayload.tenantId,
        role: mobilePayload.role,
      };
    }
  }

  // Fall back to Auth.js session token (web clients via cookie or authorization header)
  const token = await getToken({
    req: socket.request as Parameters<typeof getToken>[0]["req"],
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

async function attachRedisAdapter(io: Server): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
}

function createSocketServer(): Server {
  const port = getSocketPort();
  console.log(`Creating Socket.IO server on port ${port}...`);

  const io = new Server(port, {
    path: getSocketPath(),
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  console.log("Socket.IO server created and listening.");

  // Attach Redis adapter for multi-instance support (non-blocking)
  attachRedisAdapter(io).catch((err) => {
    console.error("Failed to attach Redis adapter to Socket.IO:", err);
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
