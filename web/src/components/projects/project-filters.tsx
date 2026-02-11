"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export function ProjectFilters() {
  const t = useTranslations("projects");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus = searchParams.get("status") ?? "ALL";

  const [searchInput, setSearchInput] = useState(currentSearch);

  const updateURL = useCallback(
    (params: { search?: string; status?: string }) => {
      const newParams = new URLSearchParams(searchParams.toString());

      if (params.search !== undefined) {
        if (params.search.trim()) {
          newParams.set("search", params.search.trim());
        } else {
          newParams.delete("search");
        }
      }

      if (params.status !== undefined) {
        if (params.status !== "ALL") {
          newParams.set("status", params.status);
        } else {
          newParams.delete("status");
        }
      }

      const query = newParams.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      startTransition(() => {
        router.replace(url);
      });
    },
    [pathname, router, searchParams, startTransition]
  );

  // Debounce search input → URL update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== currentSearch) {
        updateURL({ search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, currentSearch, updateURL]);

  function handleStatusChange(value: string) {
    updateURL({ status: value });
  }

  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${isPending ? "opacity-60" : ""}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={currentStatus} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t("filterStatus")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("filterAll")}</SelectItem>
          <SelectItem value="ACTIVE">{t("statusActive")}</SelectItem>
          <SelectItem value="PAUSED">{t("statusPaused")}</SelectItem>
          <SelectItem value="COMPLETED">{t("statusCompleted")}</SelectItem>
          <SelectItem value="ARCHIVED">{t("statusArchived")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
