"use client"

import { useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { PersonalAiChat } from "@/components/ai/personal-ai-chat"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import type { NotificationItem } from "@/actions/notifications"

type DashboardShellProps = {
  children: React.ReactNode
  initialNotifications: NotificationItem[]
  initialUnreadCount: number
  initialUnreadAiCount: number
}

export function DashboardShell({
  children,
  initialNotifications,
  initialUnreadCount,
  initialUnreadAiCount,
}: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Kontrollera AI-chattpanelens öppet/stängt-tillstånd från topbar
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const t = useTranslations("sidebar")
  const pathname = usePathname()

  // Extrahera projektId från URL: /[locale]/projects/[projectId]
  const urlProjectId = useMemo(() => {
    const match = pathname.match(/^\/[^/]+\/projects\/([^/]+)/)
    return match ? match[1] : null
  }, [pathname])

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const handleMobileMenuToggle = useCallback(() => {
    setMobileOpen((prev) => !prev)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop-sidofält */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} />
      </div>

      {/* Mobilt sidofält (sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">{t("brand")}</SheetTitle>
          <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Huvudinnehåll */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMobileMenuToggle={handleMobileMenuToggle}
          initialNotifications={initialNotifications}
          initialUnreadCount={initialUnreadCount}
          initialUnreadAiCount={initialUnreadAiCount}
          onAiChatToggle={() => setAiChatOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      {/* Personlig AI-chatt (styrs från topbar-ikonen) */}
      <PersonalAiChat open={aiChatOpen} onOpenChange={setAiChatOpen} initialProjectId={urlProjectId} />
    </div>
  )
}
