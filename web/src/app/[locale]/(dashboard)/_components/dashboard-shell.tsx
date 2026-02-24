"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { PersonalAiChat } from "@/components/ai/personal-ai-chat"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { NotificationItem } from "@/actions/notifications"
import { SocketProvider } from "@/contexts/socket-context"
import { WholesalerPanelProvider, useWholesalerPanel } from "@/contexts/wholesaler-panel-context"
import { WholesalerSearchPanel } from "@/components/wholesaler/wholesaler-search-panel"
import { AddToShoppingListDialog } from "@/components/wholesaler/add-to-shopping-list-dialog"
import type { WholesalerProduct } from "@/lib/wholesaler-search"

function WholesalerPanelOutlet() {
  const { open, data, setOpen } = useWholesalerPanel()
  const [addToListProduct, setAddToListProduct] = useState<WholesalerProduct | null>(null)

  return (
    <>
      <WholesalerSearchPanel
        key={open ? (data?.query ?? "open") : "closed"}
        open={open}
        onOpenChange={setOpen}
        initialQuery={data?.query}
        initialProducts={data?.products}
        onAddToList={(product) => setAddToListProduct(product)}
      />
      <AddToShoppingListDialog
        product={addToListProduct}
        open={addToListProduct !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setAddToListProduct(null)
        }}
      />
    </>
  )
}

const AI_CHAT_STORAGE_KEY = "ay-ai-chat-open"

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

  // AI chat state with localStorage persistence
  const [aiChatOpen, setAiChatOpen] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      return localStorage.getItem(AI_CHAT_STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })

  // Persist AI chat open state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(AI_CHAT_STORAGE_KEY, String(aiChatOpen))
    } catch {
      // Ignore storage errors
    }
  }, [aiChatOpen])

  // Voice chat: when true, PersonalAiChat opens with conversation-auto voice mode
  const [startWithVoice, setStartWithVoice] = useState(false)
  const startWithVoiceRef = useRef(false)

  const isDesktop = useMediaQuery("(min-width: 1280px)")
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

  const handleAiChatOpenChange = useCallback((open: boolean) => {
    setAiChatOpen(open)
    if (!open) {
      setStartWithVoice(false)
      startWithVoiceRef.current = false
    }
  }, [])

  const handleStartVoiceChat = useCallback(() => {
    setStartWithVoice(true)
    startWithVoiceRef.current = true
    setAiChatOpen(true)
  }, [])

  return (
    <SocketProvider enabled={true}>
      <WholesalerPanelProvider>
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
              onStartVoiceChat={handleStartVoiceChat}
            />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>

          {/* Personlig AI-chatt: dockad på xl+ (always rendered for strip), sheet på mindre skärmar */}
          {isDesktop ? (
            <PersonalAiChat
              open={aiChatOpen}
              onOpenChange={handleAiChatOpenChange}
              initialProjectId={urlProjectId}
              mode="docked"
              initialVoiceMode={startWithVoice ? "conversation-auto" : undefined}
            />
          ) : (
            <PersonalAiChat
              open={aiChatOpen}
              onOpenChange={handleAiChatOpenChange}
              initialProjectId={urlProjectId}
              mode="sheet"
              initialVoiceMode={startWithVoice ? "conversation-auto" : undefined}
            />
          )}
        </div>

        {/* Grossist-sökpanel — styrd via WholesalerPanelContext, renderad utanför chattens Sheet */}
        <WholesalerPanelOutlet />
      </WholesalerPanelProvider>
    </SocketProvider>
  )
}
