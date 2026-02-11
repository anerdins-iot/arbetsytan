"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FolderOpen, User } from "lucide-react";
import type { DashboardActivity } from "@/actions/dashboard";

type ActivityFeedProps = {
  activities: DashboardActivity[];
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const t = useTranslations("dashboard.activity");
  const sectionT = useTranslations("dashboard.sections");

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{sectionT("activity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{sectionT("activity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((activity) => {
          const actionKey = activity.action as
            | "created"
            | "updated"
            | "deleted"
            | "completed"
            | "assigned"
            | "commented"
            | "uploaded"
            | "statusChanged";
          const entityKey = activity.entity as
            | "task"
            | "project"
            | "file"
            | "comment"
            | "member";

          return (
            <div key={activity.id} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    {activity.actorName ?? "Unknown"}
                  </span>{" "}
                  {t.has(`actions.${actionKey}`)
                    ? t(`actions.${actionKey}`)
                    : activity.action}{" "}
                  {t.has(`entities.${entityKey}`)
                    ? t(`entities.${entityKey}`)
                    : activity.entity}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FolderOpen className="size-3" />
                    {activity.projectName}
                  </span>
                  <span>{formatRelativeTime(activity.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
