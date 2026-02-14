"use client"

import { useTranslations } from "next-intl"
import { usePathname } from "@/i18n/routing"
import { Link } from "@/i18n/routing"
import { Hammer, LayoutDashboard, User, FolderOpen, Clock3, Settings, PanelLeftClose, PanelLeft, Zap, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" as const },
  { href: "/personal", icon: User, labelKey: "personal" as const },
  { href: "/projects", icon: FolderOpen, labelKey: "projects" as const },
  { href: "/automations", icon: Zap, labelKey: "automations" as const },
  { href: "/email", icon: Mail, labelKey: "email" as const },
  { href: "/time", icon: Clock3, labelKey: "myTimes" as const },
] as const

const bottomItems = [
  { href: "/settings", icon: Settings, labelKey: "settings" as const },
] as const

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const t = useTranslations("nav")
  const tSidebar = useTranslations("sidebar")
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Hammer className="size-7 shrink-0 text-sidebar-primary" />
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">
              {tSidebar("brand")}
            </span>
          )}
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          const label = t(item.labelKey)

          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          }

          return <div key={item.href}>{linkContent}</div>
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom navigation */}
      <div className="space-y-1 p-2">
        {bottomItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          const label = t(item.labelKey)

          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          }

          return <div key={item.href}>{linkContent}</div>
        })}
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className={cn(
                "w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed ? "justify-center px-2" : "justify-start gap-3 px-3"
              )}
            >
              {collapsed ? (
                <PanelLeft className="size-5" />
              ) : (
                <>
                  <PanelLeftClose className="size-5" />
                  <span>{tSidebar("collapse")}</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">{tSidebar("expand")}</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  )
}
