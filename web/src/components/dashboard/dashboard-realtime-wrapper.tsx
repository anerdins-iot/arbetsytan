"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";

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

  useSocket({
    enabled: true,
    onTaskCreated: refresh,
    onTaskUpdated: refresh,
    onTaskDeleted: refresh,
    onNotification: refresh,
  });

  return <>{children}</>;
}
