"use client";

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@/lib/socket-events";

type SocketStatus = "connecting" | "connected" | "disconnected";

type SocketContextValue = {
  socket: Socket | null;
  status: SocketStatus;
  joinProjectRoom: (projectId: string) => Promise<boolean>;
};

type SocketProviderProps = {
  children: ReactNode;
  enabled: boolean;
  mobileToken?: string;
};

const SocketContext = createContext<SocketContextValue | null>(null);

function getSocketUrl(): string {
  // Socket.IO now runs on the same port as Next.js via custom server
  // Use window.location.origin for automatic protocol/host detection
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }
  return window.location.origin;
}

function getSocketPath(): string {
  return process.env.NEXT_PUBLIC_SOCKET_PATH ?? "/socket.io";
}

export function SocketProvider({
  children,
  enabled,
  mobileToken,
}: SocketProviderProps) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("disconnected");

  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setStatus("disconnected");
      return;
    }

    // Create socket connection once
    setStatus("connecting");

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

    connection.on("connect", handleConnect);
    connection.on("disconnect", handleDisconnect);
    connection.io.on("reconnect_attempt", handleReconnectAttempt);

    socketRef.current = connection;

    return () => {
      connection.off("connect", handleConnect);
      connection.off("disconnect", handleDisconnect);
      connection.io.off("reconnect_attempt", handleReconnectAttempt);
      connection.disconnect();
      socketRef.current = null;
      setStatus("disconnected");
    };
  }, [enabled, mobileToken]);

  const joinProjectRoom = async (projectId: string): Promise<boolean> => {
    if (!socketRef.current || !projectId) return false;

    return await new Promise<boolean>((resolve) => {
      socketRef.current!.emit(
        SOCKET_EVENTS.projectJoin,
        { projectId },
        (result: { success: boolean }) => resolve(Boolean(result?.success))
      );
    });
  };

  const value: SocketContextValue = {
    socket: socketRef.current,
    status,
    joinProjectRoom,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocketEvent<T = unknown>(
  eventName: string,
  handler: (payload: T) => void
): void {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useSocketEvent must be used within SocketProvider");
  }

  const { socket } = context;

  // Use ref to store handler so it doesn't trigger reconnects
  const handlerRef = useRef(handler);

  // Update ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;

    // Wrapper that calls the current handler from ref
    const eventHandler = (payload: T) => {
      handlerRef.current(payload);
    };

    socket.on(eventName, eventHandler);

    return () => {
      socket.off(eventName, eventHandler);
    };
  }, [socket, eventName]);
}

export function useSocketStatus(): SocketStatus {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useSocketStatus must be used within SocketProvider");
  }

  return context.status;
}

export function useJoinProjectRoom(): (projectId: string) => Promise<boolean> {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useJoinProjectRoom must be used within SocketProvider");
  }

  return context.joinProjectRoom;
}
