"use client";

import { useTranslations } from "next-intl";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectMember } from "@/actions/projects";

export type KanbanFilters = {
  assignee: string;
  priority: string;
  status: string;
};

type KanbanFiltersBarProps = {
  filters: KanbanFilters;
  onFiltersChange: (filters: KanbanFilters) => void;
  members: ProjectMember[];
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

export function KanbanFiltersBar({
  filters,
  onFiltersChange,
  members,
}: KanbanFiltersBarProps) {
  const t = useTranslations("projects.kanban");
  const tFilter = useTranslations("projects.kanban.filter");

  const hasActiveFilters =
    filters.assignee !== "all" ||
    filters.priority !== "all" ||
    filters.status !== "all";

  function handleReset() {
    onFiltersChange({ assignee: "all", priority: "all", status: "all" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="size-4 text-muted-foreground" />

      <Select
        value={filters.assignee}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, assignee: v })
        }
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder={tFilter("assignee")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tFilter("allAssignees")}</SelectItem>
          <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.user.name || m.user.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, priority: v })
        }
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder={tFilter("priority")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tFilter("allPriorities")}</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`priority.${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, status: v })
        }
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder={tFilter("status")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tFilter("allStatuses")}</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`columns.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-8 px-2 text-xs"
        >
          <X className="mr-1 size-3" />
          {tFilter("clear")}
        </Button>
      )}
    </div>
  );
}
