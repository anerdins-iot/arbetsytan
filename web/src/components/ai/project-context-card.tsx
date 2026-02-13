"use client";

import { useTranslations } from "next-intl";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProjectContextResult } from "@/actions/project-context";

type ProjectContextCardProps = {
  context: ProjectContextResult;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  PLANNING: "outline",
  ACTIVE: "default",
  PAUSED: "secondary",
  COMPLETED: "secondary",
  ARCHIVED: "secondary",
};

export function ProjectContextCard({ context }: ProjectContextCardProps) {
  const t = useTranslations("personalAi.projectContext");

  const { project, taskStats, upcomingDeadlines, members } = context;

  return (
    <Card className="mx-4 mt-2 border-accent/30 bg-accent/5">
      <CardContent className="p-3">
        {/* Project name + status */}
        <div className="mb-2 flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground truncate">
            {project.name}
          </h4>
          <Badge
            variant={STATUS_VARIANT[project.status] ?? "outline"}
            className="text-[10px] px-1.5 py-0"
          >
            {t(`status.${project.status}`)}
          </Badge>
        </div>

        {/* Task stats */}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Circle className="size-3 text-muted-foreground" />
            {t("tasksTodo", { count: taskStats.todo })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3 text-accent" />
            {t("tasksInProgress", { count: taskStats.inProgress })}
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3 text-primary" />
            {t("tasksDone", { count: taskStats.done })}
          </span>
        </div>

        {/* Upcoming deadlines */}
        {upcomingDeadlines.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              {t("deadlinesTitle")}
            </p>
            <div className="space-y-0.5">
              {upcomingDeadlines.slice(0, 3).map((d, i) => {
                const deadlineDate = new Date(d.deadline);
                const formatted = deadlineDate.toLocaleDateString("sv-SE", {
                  day: "numeric",
                  month: "short",
                });
                return (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-xs text-foreground"
                  >
                    <CalendarClock className="size-3 shrink-0 text-accent" />
                    <span className="truncate">{d.title}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {formatted}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3" />
          <span>
            {t("members", { count: members.count })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
