"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type RealtimeNotification,
} from "@/lib/socket-events";

type SocketStatus = "connecting" | "connected" | "disconnected";

type UseSocketOptions = {
  enabled: boolean;
  onNotification?: (notification: RealtimeNotification) => void;
  mobileToken?: string;
};

type UseSocketResult = {
  status: SocketStatus;
  joinProjectRoom: (projectId: string) => Promise<boolean>;
};

function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }
  const port = process.env.NEXT_PUBLIC_SOCKET_PORT ?? "3001";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

function getSocketPath(): string {
  return process.env.NEXT_PUBLIC_SOCKET_PATH ?? "/socket.io";
}

export function useSocket({
  enabled,
  onNotification,
  mobileToken,
}: UseSocketOptions): UseSocketResult {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("disconnected");

  useEffect(() => {
    if (!enabled) {
      setSocket((current) => {
        current?.disconnect();
        return null;
      });
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");

    // Starts the server lazily in the Next.js process.
    void fetch("/api/socket", { method: "GET", cache: "no-store" }).catch(() => null);

    const connection = io(getSocketUrl(), {
      path: getSocketPath(),
      withCredentials: true,
      reconnection: true,
      autoConnect: true,
      auth: mobileToken ? { token: mobileToken } : undefined,
      transports: ["websocket", "polling"],
    });

    const handleConnect = () => setStatus("connected");
    const handleDisconnect = () => setStatus("disconnected");
    const handleReconnectAttempt = () => setStatus("connecting");
    const handleNotification = (payload: RealtimeNotification) => {
      onNotification?.(payload);
    };

    connection.on("connect", handleConnect);
    connection.on("disconnect", handleDisconnect);
    connection.io.on("reconnect_attempt", handleReconnectAttempt);
    connection.on(SOCKET_EVENTS.notificationNew, handleNotification);

    setSocket(connection);

    return () => {
      connection.off("connect", handleConnect);
      connection.off("disconnect", handleDisconnect);
      connection.io.off("reconnect_attempt", handleReconnectAttempt);
      connection.off(SOCKET_EVENTS.notificationNew, handleNotification);
      connection.disconnect();
      setSocket(null);
      setStatus("disconnected");
    };
  }, [enabled, mobileToken, onNotification]);

  const joinProjectRoom = useMemo(
    () => async (projectId: string) => {
      if (!socket || !projectId) return false;

      return await new Promise<boolean>((resolve) => {
        socket.emit(
          SOCKET_EVENTS.projectJoin,
          { projectId },
          (result: { success: boolean }) => resolve(Boolean(result?.success))
        );
      });
    },
    [socket]
  );

  return { status, joinProjectRoom };
}
