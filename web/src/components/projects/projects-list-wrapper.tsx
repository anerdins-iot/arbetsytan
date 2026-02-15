'use client'

import { useRouter } from 'next/navigation'
import { useSocket } from '@/hooks/use-socket'

interface ProjectsListWrapperProps {
  children: React.ReactNode
  tenantId: string
}

export function ProjectsListWrapper({ children, tenantId }: ProjectsListWrapperProps) {
  const router = useRouter()
  
  useSocket({
    enabled: true,
    onProjectCreated: () => router.refresh(),
    onProjectUpdated: () => router.refresh(),
    onProjectArchived: () => router.refresh(),
  })
  
  return <>{children}</>
}
