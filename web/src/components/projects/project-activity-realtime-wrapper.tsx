"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSocketEvent, useJoinProjectRoom, useSocketStatus } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

type ProjectActivityRealtimeWrapperProps = {
  projectId: string;
  children: ReactNode;
};

export function ProjectActivityRealtimeWrapper({
  projectId,
  children,
}: ProjectActivityRealtimeWrapperProps) {
  const router = useRouter();
  const joinProjectRoom = useJoinProjectRoom();
  const status = useSocketStatus();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      router.refresh();
    }, 150);
  }, [router]);

  useSocketEvent(SOCKET_EVENTS.taskCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.taskUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.taskDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.commentCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.commentUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.commentDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.fileCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.fileUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.fileDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.projectMemberAdded, refresh);
  useSocketEvent(SOCKET_EVENTS.projectMemberRemoved, refresh);

  useEffect(() => {
    if (status !== "connected" || !projectId) return;
    joinProjectRoom(projectId);
  }, [status, projectId, joinProjectRoom]);

  return <>{children}</>;
}
