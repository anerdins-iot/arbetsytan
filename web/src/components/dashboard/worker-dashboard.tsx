"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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

type WorkerDashboardProps = {
  tasks: DashboardTask[];
  userName: string | null;
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "TODO":
      return <Circle className="size-5 text-muted-foreground" />;
    case "IN_PROGRESS":
      return <Clock className="size-5 text-blue-500" />;
    case "DONE":
      return <CheckCircle2 className="size-5 text-green-500" />;
    default:
      return <Circle className="size-5 text-muted-foreground" />;
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
    <Badge variant={variantMap[priority] ?? "outline"}>
      {t(priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT")}
    </Badge>
  );
}

export function WorkerDashboard({ tasks, userName }: WorkerDashboardProps) {
  const t = useTranslations("dashboard.worker");
  const taskT = useTranslations("dashboard.tasks");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("greeting", { name: userName ?? "" })}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("title")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {tasks.length === 0
              ? taskT("emptyToday")
              : `${tasks.length} ${tasks.length === 1 ? taskT("status.TODO").toLowerCase() : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="size-12 text-green-500/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {taskT("emptyToday")}
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const deadline = task.deadline ? new Date(task.deadline) : null;
              const now = new Date();
              const today = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
              );
              const isOverdue =
                deadline &&
                new Date(
                  deadline.getFullYear(),
                  deadline.getMonth(),
                  deadline.getDate()
                ) < today;

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50"
                >
                  <StatusIcon status={task.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium">{task.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/projects/${task.projectId}`}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <FolderOpen className="size-3.5" />
                        {task.projectName}
                      </Link>
                      {deadline && (
                        <span
                          className={`flex items-center gap-1 text-sm ${
                            isOverdue
                              ? "text-destructive font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          {isOverdue && <AlertTriangle className="size-3.5" />}
                          <CalendarDays className="size-3.5" />
                          {isOverdue
                            ? taskT("overdue")
                            : deadline.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <PriorityBadge priority={task.priority} />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
