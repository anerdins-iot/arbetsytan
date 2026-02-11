"use client"

import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

type DashboardShellProps = {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useTranslations("sidebar")

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const handleMobileMenuToggle = useCallback(() => {
    setMobileOpen((prev) => !prev)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} />
      </div>

      {/* Mobile sidebar (sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">{t("brand")}</SheetTitle>
          <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMobileMenuToggle={handleMobileMenuToggle} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
