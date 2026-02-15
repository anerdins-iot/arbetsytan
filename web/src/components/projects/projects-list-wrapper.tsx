'use client'

import { useCallback } from 'react';
import { useRouter } from 'next/navigation'
import { useSocketEvent } from '@/contexts/socket-context';
import { SOCKET_EVENTS } from '@/lib/socket-events'

interface ProjectsListWrapperProps {
  children: React.ReactNode
  tenantId: string
}

export function ProjectsListWrapper({ children, tenantId }: ProjectsListWrapperProps) {
  const router = useRouter()

  const refresh = useCallback(() => router.refresh(), [router]);

  useSocketEvent(SOCKET_EVENTS.projectCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.projectUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.projectArchived, refresh);

  return <>{children}</>
}
