"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Bell, Menu, Search, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Link } from "@/i18n/routing"
import { globalSearch, type GlobalSearchResult } from "@/actions/search"

type TopbarProps = {
  onMobileMenuToggle: () => void
}

export function Topbar({ onMobileMenuToggle }: TopbarProps) {
  const t = useTranslations("topbar")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GlobalSearchResult>({
    projects: [],
    tasks: [],
  })
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasError, setHasError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  const hasQuery = query.trim().length >= 2
  const hasResults = results.projects.length > 0 || results.tasks.length > 0

  function clearDebounce() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  function resetSearchResults() {
    setResults({ projects: [], tasks: [] })
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
        setResults({ projects: [], tasks: [] })
      } finally {
        if (requestIdRef.current === requestId) {
          setIsSearching(false)
        }
      }
    }, 300)
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-1">
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
