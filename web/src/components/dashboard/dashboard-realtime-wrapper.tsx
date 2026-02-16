"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

type DashboardRealtimeWrapperProps = {
  children: ReactNode;
};

export function DashboardRealtimeWrapper({
  children,
}: DashboardRealtimeWrapperProps) {
  const router = useRouter();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useSocketEvent(SOCKET_EVENTS.taskCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.taskUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.taskDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.projectCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.projectUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.commentCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.commentUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.commentDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.fileCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.fileUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.fileDeleted, refresh);
  useSocketEvent(SOCKET_EVENTS.notificationNew, refresh);

  return <>{children}</>;
}
