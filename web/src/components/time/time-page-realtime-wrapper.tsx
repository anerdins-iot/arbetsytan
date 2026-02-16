"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

type TimePageRealtimeWrapperProps = {
  children: ReactNode;
};

export function TimePageRealtimeWrapper({
  children,
}: TimePageRealtimeWrapperProps) {
  const router = useRouter();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useSocketEvent(SOCKET_EVENTS.timeEntryCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.timeEntryDeleted, refresh);

  return <>{children}</>;
}
