"use client"

import { useTranslations } from "next-intl"
import { Bell, Menu, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Separator } from "@/components/ui/separator"

type TopbarProps = {
  onMobileMenuToggle: () => void
}

export function Topbar({ onMobileMenuToggle }: TopbarProps) {
  const t = useTranslations("topbar")

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuToggle}
      >
        <Menu className="size-5" />
        <span className="sr-only">{t("openMenu")}</span>
      </Button>

      {/* Spacer for desktop */}
      <div className="hidden lg:block" />

      {/* Right section */}
      <div className="flex items-center gap-1">
        <ModeToggle />

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          <span className="sr-only">{t("notifications")}</span>
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* User placeholder */}
        <Button variant="ghost" size="sm" className="gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="size-4" />
          </div>
          <span className="hidden text-sm font-medium sm:inline-block">
            {t("user")}
          </span>
        </Button>
      </div>
    </header>
  )
}
