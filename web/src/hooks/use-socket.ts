"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type RealtimeFileEvent,
  type RealtimeNotification,
  type RealtimeNoteCategoryEvent,
  type RealtimeNoteEvent,
  type RealtimeProjectUpdatedEvent,
  type RealtimeTaskEvent,
  type RealtimeCommentEvent,
  type RealtimeTimeEntryEvent,
  type RealtimeInvitationEvent,
  type RealtimeMembershipEvent,
} from "@/lib/socket-events";

type SocketStatus = "connecting" | "connected" | "disconnected";

type UseSocketOptions = {
  enabled: boolean;
  onNotification?: (notification: RealtimeNotification) => void;
  onTaskCreated?: (event: RealtimeTaskEvent) => void;
  onTaskUpdated?: (event: RealtimeTaskEvent) => void;
  onTaskDeleted?: (event: RealtimeTaskEvent) => void;
  onCommentCreated?: (event: RealtimeCommentEvent) => void;
  onCommentUpdated?: (event: RealtimeCommentEvent) => void;
  onCommentDeleted?: (event: RealtimeCommentEvent) => void;
  onTimeEntryCreated?: (event: RealtimeTimeEntryEvent) => void;
  onTimeEntryUpdated?: (event: RealtimeTimeEntryEvent) => void;
  onTimeEntryDeleted?: (event: RealtimeTimeEntryEvent) => void;
  onFileCreated?: (event: RealtimeFileEvent) => void;
  onFileUpdated?: (event: RealtimeFileEvent) => void;
  onFileDeleted?: (event: RealtimeFileEvent) => void;
  onProjectUpdated?: (event: RealtimeProjectUpdatedEvent) => void;
  onNoteCreated?: (event: RealtimeNoteEvent) => void;
  onNoteUpdated?: (event: RealtimeNoteEvent) => void;
  onNoteDeleted?: (event: RealtimeNoteEvent) => void;
  onNoteCategoryCreated?: (event: RealtimeNoteCategoryEvent) => void;
  onNoteCategoryUpdated?: (event: RealtimeNoteCategoryEvent) => void;
  onNoteCategoryDeleted?: (event: RealtimeNoteCategoryEvent) => void;
  onInvitationCreated?: (event: RealtimeInvitationEvent) => void;
  onInvitationUpdated?: (event: RealtimeInvitationEvent) => void;
  onInvitationDeleted?: (event: RealtimeInvitationEvent) => void;
  onMembershipCreated?: (event: RealtimeMembershipEvent) => void;
  mobileToken?: string;
};

type UseSocketResult = {
  status: SocketStatus;
  joinProjectRoom: (projectId: string) => Promise<boolean>;
};

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

export function useSocket({
  enabled,
  onNotification,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onCommentCreated,
  onCommentUpdated,
  onCommentDeleted,
  onTimeEntryCreated,
  onTimeEntryUpdated,
  onTimeEntryDeleted,
  onFileCreated,
  onFileUpdated,
  onFileDeleted,
  onProjectUpdated,
  onNoteCreated,
  onNoteUpdated,
  onNoteDeleted,
  onNoteCategoryCreated,
  onNoteCategoryUpdated,
  onNoteCategoryDeleted,
  onInvitationCreated,
  onInvitationUpdated,
  onInvitationDeleted,
  onMembershipCreated,
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
    const handleCommentCreated = (payload: RealtimeCommentEvent) => {
      onCommentCreated?.(payload);
    };
    const handleCommentUpdated = (payload: RealtimeCommentEvent) => {
      onCommentUpdated?.(payload);
    };
    const handleCommentDeleted = (payload: RealtimeCommentEvent) => {
      onCommentDeleted?.(payload);
    };
    const handleTimeEntryCreated = (payload: RealtimeTimeEntryEvent) => {
      onTimeEntryCreated?.(payload);
    };
    const handleTimeEntryUpdated = (payload: RealtimeTimeEntryEvent) => {
      onTimeEntryUpdated?.(payload);
    };
    const handleTimeEntryDeleted = (payload: RealtimeTimeEntryEvent) => {
      onTimeEntryDeleted?.(payload);
    };
    const handleFileCreated = (payload: RealtimeFileEvent) => {
      onFileCreated?.(payload);
    };
    const handleFileUpdated = (payload: RealtimeFileEvent) => {
      onFileUpdated?.(payload);
    };
    const handleFileDeleted = (payload: RealtimeFileEvent) => {
      onFileDeleted?.(payload);
    };
    const handleProjectUpdated = (payload: RealtimeProjectUpdatedEvent) => {
      onProjectUpdated?.(payload);
    };
    const handleNoteCreated = (payload: RealtimeNoteEvent) => {
      onNoteCreated?.(payload);
    };
    const handleNoteUpdated = (payload: RealtimeNoteEvent) => {
      onNoteUpdated?.(payload);
    };
    const handleNoteDeleted = (payload: RealtimeNoteEvent) => {
      onNoteDeleted?.(payload);
    };
    const handleNoteCategoryCreated = (payload: RealtimeNoteCategoryEvent) => {
      onNoteCategoryCreated?.(payload);
    };
    const handleNoteCategoryUpdated = (payload: RealtimeNoteCategoryEvent) => {
      onNoteCategoryUpdated?.(payload);
    };
    const handleNoteCategoryDeleted = (payload: RealtimeNoteCategoryEvent) => {
      onNoteCategoryDeleted?.(payload);
    };
    const handleInvitationCreated = (payload: RealtimeInvitationEvent) => {
      onInvitationCreated?.(payload);
    };
    const handleInvitationUpdated = (payload: RealtimeInvitationEvent) => {
      onInvitationUpdated?.(payload);
    };
    const handleInvitationDeleted = (payload: RealtimeInvitationEvent) => {
      onInvitationDeleted?.(payload);
    };
    const handleMembershipCreated = (payload: RealtimeMembershipEvent) => {
      onMembershipCreated?.(payload);
    };

    connection.on("connect", handleConnect);
    connection.on("disconnect", handleDisconnect);
    connection.io.on("reconnect_attempt", handleReconnectAttempt);
    connection.on(SOCKET_EVENTS.notificationNew, handleNotification);
    connection.on(SOCKET_EVENTS.taskCreated, handleTaskCreated);
    connection.on(SOCKET_EVENTS.taskUpdated, handleTaskUpdated);
    connection.on(SOCKET_EVENTS.taskDeleted, handleTaskDeleted);
    connection.on(SOCKET_EVENTS.commentCreated, handleCommentCreated);
    connection.on(SOCKET_EVENTS.commentUpdated, handleCommentUpdated);
    connection.on(SOCKET_EVENTS.commentDeleted, handleCommentDeleted);
    connection.on(SOCKET_EVENTS.timeEntryCreated, handleTimeEntryCreated);
    connection.on(SOCKET_EVENTS.timeEntryUpdated, handleTimeEntryUpdated);
    connection.on(SOCKET_EVENTS.timeEntryDeleted, handleTimeEntryDeleted);
    connection.on(SOCKET_EVENTS.fileCreated, handleFileCreated);
    connection.on(SOCKET_EVENTS.fileUpdated, handleFileUpdated);
    connection.on(SOCKET_EVENTS.fileDeleted, handleFileDeleted);
    connection.on(SOCKET_EVENTS.projectUpdated, handleProjectUpdated);
    connection.on(SOCKET_EVENTS.noteCreated, handleNoteCreated);
    connection.on(SOCKET_EVENTS.noteUpdated, handleNoteUpdated);
    connection.on(SOCKET_EVENTS.noteDeleted, handleNoteDeleted);
    connection.on(SOCKET_EVENTS.noteCategoryCreated, handleNoteCategoryCreated);
    connection.on(SOCKET_EVENTS.noteCategoryUpdated, handleNoteCategoryUpdated);
    connection.on(SOCKET_EVENTS.noteCategoryDeleted, handleNoteCategoryDeleted);
    connection.on(SOCKET_EVENTS.invitationCreated, handleInvitationCreated);
    connection.on(SOCKET_EVENTS.invitationUpdated, handleInvitationUpdated);
    connection.on(SOCKET_EVENTS.invitationDeleted, handleInvitationDeleted);
    connection.on(SOCKET_EVENTS.membershipCreated, handleMembershipCreated);

    setSocket(connection);

    return () => {
      connection.off("connect", handleConnect);
      connection.off("disconnect", handleDisconnect);
      connection.io.off("reconnect_attempt", handleReconnectAttempt);
      connection.off(SOCKET_EVENTS.notificationNew, handleNotification);
      connection.off(SOCKET_EVENTS.taskCreated, handleTaskCreated);
      connection.off(SOCKET_EVENTS.taskUpdated, handleTaskUpdated);
      connection.off(SOCKET_EVENTS.taskDeleted, handleTaskDeleted);
      connection.off(SOCKET_EVENTS.commentCreated, handleCommentCreated);
      connection.off(SOCKET_EVENTS.commentUpdated, handleCommentUpdated);
      connection.off(SOCKET_EVENTS.commentDeleted, handleCommentDeleted);
      connection.off(SOCKET_EVENTS.timeEntryCreated, handleTimeEntryCreated);
      connection.off(SOCKET_EVENTS.timeEntryUpdated, handleTimeEntryUpdated);
      connection.off(SOCKET_EVENTS.timeEntryDeleted, handleTimeEntryDeleted);
      connection.off(SOCKET_EVENTS.fileCreated, handleFileCreated);
      connection.off(SOCKET_EVENTS.fileUpdated, handleFileUpdated);
      connection.off(SOCKET_EVENTS.fileDeleted, handleFileDeleted);
      connection.off(SOCKET_EVENTS.projectUpdated, handleProjectUpdated);
      connection.off(SOCKET_EVENTS.noteCreated, handleNoteCreated);
      connection.off(SOCKET_EVENTS.noteUpdated, handleNoteUpdated);
      connection.off(SOCKET_EVENTS.noteDeleted, handleNoteDeleted);
      connection.off(SOCKET_EVENTS.noteCategoryCreated, handleNoteCategoryCreated);
      connection.off(SOCKET_EVENTS.noteCategoryUpdated, handleNoteCategoryUpdated);
      connection.off(SOCKET_EVENTS.noteCategoryDeleted, handleNoteCategoryDeleted);
      connection.off(SOCKET_EVENTS.invitationCreated, handleInvitationCreated);
      connection.off(SOCKET_EVENTS.invitationUpdated, handleInvitationUpdated);
      connection.off(SOCKET_EVENTS.invitationDeleted, handleInvitationDeleted);
      connection.off(SOCKET_EVENTS.membershipCreated, handleMembershipCreated);
      connection.disconnect();
      setSocket(null);
      setStatus("disconnected");
    };
  }, [
    enabled,
    mobileToken,
    onFileCreated,
    onFileUpdated,
    onFileDeleted,
    onNoteCategoryCreated,
    onNoteCategoryDeleted,
    onNoteCategoryUpdated,
    onNoteCreated,
    onNoteDeleted,
    onNoteUpdated,
    onNotification,
    onProjectUpdated,
    onTaskCreated,
    onTaskDeleted,
    onTaskUpdated,
    onCommentCreated,
    onCommentDeleted,
    onCommentUpdated,
    onTimeEntryCreated,
    onTimeEntryUpdated,
    onTimeEntryDeleted,
    onInvitationCreated,
    onInvitationUpdated,
    onInvitationDeleted,
    onMembershipCreated,
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
