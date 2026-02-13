"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Bell, Bot, CheckCheck, FileText, Menu, Search, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Link } from "@/i18n/routing"
import { globalSearch, type GlobalSearchResult } from "@/actions/search"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/actions/notifications"
import { useSocket } from "@/hooks/use-socket"

type TopbarProps = {
  onMobileMenuToggle: () => void
  initialNotifications: NotificationItem[]
  initialUnreadCount: number
  initialUnreadAiCount: number
  onAiChatToggle: () => void
}

export function Topbar({
  onMobileMenuToggle,
  initialNotifications,
  initialUnreadCount,
  initialUnreadAiCount,
  onAiChatToggle,
}: TopbarProps) {
  const t = useTranslations("topbar")
  const locale = useLocale()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GlobalSearchResult>({
    projects: [],
    tasks: [],
    files: [],
    documents: [],
  })
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isNotificationsPending, startNotificationsTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  const hasQuery = query.trim().length >= 2
  const hasResults = results.projects.length > 0 || results.tasks.length > 0 || results.files.length > 0 || results.documents.length > 0

  const handleRealtimeNotification = useCallback((incoming: NotificationItem) => {
    setNotifications((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== incoming.id)
      return [incoming, ...withoutDuplicate].slice(0, 20)
    })
    if (!incoming.read) {
      setUnreadCount((current) => current + 1)
    }
  }, [])

  useSocket({
    enabled: true,
    onNotification: handleRealtimeNotification,
  })

  function clearDebounce() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  function resetSearchResults() {
    setResults({ projects: [], tasks: [], files: [], documents: [] })
    setHasError(false)
    setIsSearching(false)
  }

  function handleResultClick() {
    setIsOpen(false)
    setQuery("")
    resetSearchResults()
  }

  function handleInputChange(value: string) {
    setQuery(value)
    setHasError(false)
    clearDebounce()

    const trimmed = value.trim()
    if (trimmed.length < 2) {
      resetSearchResults()
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsSearching(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await globalSearch({ query: trimmed })
        if (requestIdRef.current !== requestId) return
        setResults(response)
      } catch {
        if (requestIdRef.current !== requestId) return
        setHasError(true)
        setResults({ projects: [], tasks: [], files: [], documents: [] })
      } finally {
        if (requestIdRef.current === requestId) {
          setIsSearching(false)
        }
      }
    }, 300)
  }

  function formatNotificationDate(value: string): string {
    const date = new Date(value)
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date)
  }

  function handleMarkNotificationRead(notificationId: string) {
    startNotificationsTransition(async () => {
      const result = await markNotificationRead({ notificationId })
      if (!result.success) return

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId ? { ...notification, read: true } : notification
        )
      )
      setUnreadCount((current) => Math.max(0, current - 1))
    })
  }

  function handleMarkAllRead() {
    startNotificationsTransition(async () => {
      const result = await markAllNotificationsRead()
      if (!result.success) return

      setNotifications((current) =>
        current.map((notification) => ({ ...notification, read: true }))
      )
      setUnreadCount(0)
    })
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
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

      {/* Global search */}
      <div className="relative w-full max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 120)}
          onChange={(event) => handleInputChange(event.target.value)}
          placeholder={t("search.placeholder")}
          className="pl-9"
          aria-label={t("search.placeholder")}
        />

        {isOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-96 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
            {!hasQuery ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t("search.minCharacters")}
              </p>
            ) : isSearching ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t("search.searching")}
              </p>
            ) : hasError ? (
              <p className="px-4 py-3 text-sm text-destructive">
                {t("search.error")}
              </p>
            ) : !hasResults ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t("search.noResults")}
              </p>
            ) : (
              <div className="py-2">
                {results.projects.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("search.projects")}
                    </p>
                    <div className="space-y-1 px-2 pb-2">
                      {results.projects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          onClick={handleResultClick}
                          className="block rounded-md px-2 py-2 hover:bg-muted"
                        >
                          <p className="text-sm font-medium text-foreground">{project.name}</p>
                          {project.description ? (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {project.description}
                            </p>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {results.tasks.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("search.tasks")}
                    </p>
                    <div className="space-y-1 px-2 pb-2">
                      {results.tasks.map((task) => (
                        <Link
                          key={task.id}
                          href={`/projects/${task.projectId}?tab=tasks&taskId=${task.id}`}
                          onClick={handleResultClick}
                          className="block rounded-md px-2 py-2 hover:bg-muted"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">
                              {task.title}
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              {t(`search.taskStatus.${task.status}`)}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {t("search.inProject", { project: task.projectName })}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {results.files.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("search.files")}
                    </p>
                    <div className="space-y-1 px-2 pb-2">
                      {results.files.map((file) => (
                        <Link
                          key={file.id}
                          href={`/projects/${file.projectId}?tab=files`}
                          onClick={handleResultClick}
                          className="block rounded-md px-2 py-2 hover:bg-muted"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <p className="line-clamp-1 text-sm font-medium text-foreground">
                              {file.name}
                            </p>
                          </div>
                          <p className="line-clamp-1 text-xs text-muted-foreground pl-6">
                            {t("search.inProject", { project: file.projectName })}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {results.documents.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("search.documents")}
                    </p>
                    <div className="space-y-1 px-2 pb-2">
                      {results.documents.map((doc) => (
                        <Link
                          key={doc.chunkId}
                          href={`/projects/${doc.projectId}?tab=files`}
                          onClick={handleResultClick}
                          className="block rounded-md px-2 py-2 hover:bg-muted"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <p className="line-clamp-1 text-sm font-medium text-foreground">
                              {doc.fileName}
                              {doc.page !== null ? ` (${t("search.page", { page: doc.page })})` : ""}
                            </p>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground pl-6">
                            {doc.content}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground pl-6">
                            {doc.projectName ? t("search.inProject", { project: doc.projectName }) : t("search.personalFile", { defaultValue: "Personlig fil" })}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Högersektion med AI-chatt, notifikationer och profil */}
      <div className="ml-auto flex items-center gap-1">
        <ModeToggle />

        {/* AI-chatt-knapp */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={onAiChatToggle}
          aria-label={t("aiChat")}
        >
          <Bot className="size-5" />
          {initialUnreadAiCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
              {initialUnreadAiCount > 99 ? "99+" : initialUnreadAiCount}
            </span>
          ) : null}
        </Button>

        <DropdownMenu open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
              <span className="sr-only">{t("notifications")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[22rem] p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <DropdownMenuLabel className="p-0">
                {t("notificationPanel.title")}
              </DropdownMenuLabel>
              {unreadCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2"
                  onClick={handleMarkAllRead}
                  disabled={isNotificationsPending}
                >
                  <CheckCheck className="size-3.5" />
                  {t("notificationPanel.markAllRead")}
                </Button>
              ) : null}
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {t("notificationPanel.empty")}
                </p>
              ) : (
                <ul className="divide-y">
                  {notifications.map((notification) => (
                    <li key={notification.id} className="px-3 py-2">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          if (!notification.read) {
                            handleMarkNotificationRead(notification.id)
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm ${
                              notification.read ? "font-normal" : "font-medium"
                            }`}
                          >
                            {notification.title}
                          </p>
                          {!notification.read ? (
                            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatNotificationDate(notification.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* User placeholder */}
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href="/settings/profile">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="size-4" />
          </div>
          <span className="hidden text-sm font-medium sm:inline-block">
            {t("profile")}
          </span>
          </Link>
        </Button>
      </div>
    </header>
  )
}
