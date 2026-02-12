"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type RealtimeFileEvent,
  type RealtimeNotification,
  type RealtimeProjectUpdatedEvent,
  type RealtimeTaskEvent,
} from "@/lib/socket-events";

type SocketStatus = "connecting" | "connected" | "disconnected";

type UseSocketOptions = {
  enabled: boolean;
  onNotification?: (notification: RealtimeNotification) => void;
  onTaskCreated?: (event: RealtimeTaskEvent) => void;
  onTaskUpdated?: (event: RealtimeTaskEvent) => void;
  onTaskDeleted?: (event: RealtimeTaskEvent) => void;
  onFileCreated?: (event: RealtimeFileEvent) => void;
  onFileDeleted?: (event: RealtimeFileEvent) => void;
  onProjectUpdated?: (event: RealtimeProjectUpdatedEvent) => void;
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
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onFileCreated,
  onFileDeleted,
  onProjectUpdated,
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
    const handleTaskCreated = (payload: RealtimeTaskEvent) => {
      onTaskCreated?.(payload);
    };
    const handleTaskUpdated = (payload: RealtimeTaskEvent) => {
      onTaskUpdated?.(payload);
    };
    const handleTaskDeleted = (payload: RealtimeTaskEvent) => {
      onTaskDeleted?.(payload);
    };
    const handleFileCreated = (payload: RealtimeFileEvent) => {
      onFileCreated?.(payload);
    };
    const handleFileDeleted = (payload: RealtimeFileEvent) => {
      onFileDeleted?.(payload);
    };
    const handleProjectUpdated = (payload: RealtimeProjectUpdatedEvent) => {
      onProjectUpdated?.(payload);
    };

    connection.on("connect", handleConnect);
    connection.on("disconnect", handleDisconnect);
    connection.io.on("reconnect_attempt", handleReconnectAttempt);
    connection.on(SOCKET_EVENTS.notificationNew, handleNotification);
    connection.on(SOCKET_EVENTS.taskCreated, handleTaskCreated);
    connection.on(SOCKET_EVENTS.taskUpdated, handleTaskUpdated);
    connection.on(SOCKET_EVENTS.taskDeleted, handleTaskDeleted);
    connection.on(SOCKET_EVENTS.fileCreated, handleFileCreated);
    connection.on(SOCKET_EVENTS.fileDeleted, handleFileDeleted);
    connection.on(SOCKET_EVENTS.projectUpdated, handleProjectUpdated);

    setSocket(connection);

    return () => {
      connection.off("connect", handleConnect);
      connection.off("disconnect", handleDisconnect);
      connection.io.off("reconnect_attempt", handleReconnectAttempt);
      connection.off(SOCKET_EVENTS.notificationNew, handleNotification);
      connection.off(SOCKET_EVENTS.taskCreated, handleTaskCreated);
      connection.off(SOCKET_EVENTS.taskUpdated, handleTaskUpdated);
      connection.off(SOCKET_EVENTS.taskDeleted, handleTaskDeleted);
      connection.off(SOCKET_EVENTS.fileCreated, handleFileCreated);
      connection.off(SOCKET_EVENTS.fileDeleted, handleFileDeleted);
      connection.off(SOCKET_EVENTS.projectUpdated, handleProjectUpdated);
      connection.disconnect();
      setSocket(null);
      setStatus("disconnected");
    };
  }, [
    enabled,
    mobileToken,
    onFileCreated,
    onFileDeleted,
    onNotification,
    onProjectUpdated,
    onTaskCreated,
    onTaskDeleted,
    onTaskUpdated,
  ]);

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
