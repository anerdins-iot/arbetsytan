"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  CalendarDays,
  FolderOpen,
} from "lucide-react";
import type { DashboardTask } from "@/actions/dashboard";

type TaskListProps = {
  tasks: DashboardTask[];
  emptyKey?: string;
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "TODO":
      return <Circle className="size-4 text-muted-foreground" />;
    case "IN_PROGRESS":
      return <Clock className="size-4 text-primary" />;
    case "DONE":
      return <CheckCircle2 className="size-4 text-success" />;
    default:
      return <Circle className="size-4 text-muted-foreground" />;
  }
}

function PriorityBadge({ priority }: { priority: string }) {
  const t = useTranslations("dashboard.tasks.priority");

  const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    LOW: "secondary",
    MEDIUM: "outline",
    HIGH: "default",
    URGENT: "destructive",
  };

  return (
    <Badge variant={variantMap[priority] ?? "outline"} className="text-xs">
      {t(priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT")}
    </Badge>
  );
}

function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  const t = useTranslations("dashboard.tasks");

  if (!deadline) {
    return (
      <span className="text-xs text-muted-foreground">{t("noDeadline")}</span>
    );
  }

  const date = new Date(deadline);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const isOverdue = deadlineDate < today;
  const isToday = deadlineDate.getTime() === today.getTime();

  return (
    <span
      className={`flex items-center gap-1 text-xs ${
        isOverdue
          ? "text-destructive font-medium"
          : isToday
            ? "text-warning font-medium"
            : "text-muted-foreground"
      }`}
    >
      {isOverdue && <AlertTriangle className="size-3" />}
      <CalendarDays className="size-3" />
      {isOverdue
        ? t("overdue")
        : isToday
          ? t("today")
          : date.toLocaleDateString()}
    </span>
  );
}

export function TaskList({ tasks, emptyKey = "empty" }: TaskListProps) {
  const t = useTranslations("dashboard.tasks");
  const sectionT = useTranslations("dashboard.sections");

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{sectionT("tasks")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t(emptyKey as "empty" | "emptyToday")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{sectionT("tasks")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
          >
            <StatusIcon status={task.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Link
                  href={`/projects/${task.projectId}`}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen className="size-3" />
                  {task.projectName}
                </Link>
                <DeadlineDisplay deadline={task.deadline} />
              </div>
            </div>
            <PriorityBadge priority={task.priority} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
