"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FolderOpen,
  CheckSquare,
  Clock,
  MapPin,
} from "lucide-react";
import type { ProjectWithCounts } from "@/actions/projects";

type ProjectCardProps = {
  project: ProjectWithCounts;
};

function statusVariant(
  status: string
): "default" | "secondary" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "PAUSED":
      return "secondary";
    case "COMPLETED":
      return "outline";
    case "ARCHIVED":
      return "secondary";
    default:
      return "default";
  }
}

function useStatusLabel(status: string) {
  const t = useTranslations("projects");
  switch (status) {
    case "ACTIVE":
      return t("statusActive");
    case "PAUSED":
      return t("statusPaused");
    case "COMPLETED":
      return t("statusCompleted");
    case "ARCHIVED":
      return t("statusArchived");
    default:
      return status;
  }
}

function formatRelativeDate(date: Date, locale: string): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return locale === "sv" ? "Just nu" : "Just now";
      return locale === "sv"
        ? `${diffMinutes} min sedan`
        : `${diffMinutes}m ago`;
    }
    return locale === "sv"
      ? `${diffHours} tim sedan`
      : `${diffHours}h ago`;
  }
  if (diffDays === 1) return locale === "sv" ? "Igår" : "Yesterday";
  if (diffDays < 7)
    return locale === "sv"
      ? `${diffDays} dagar sedan`
      : `${diffDays}d ago`;

  return new Date(date).toLocaleDateString(locale === "sv" ? "sv-SE" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ProjectCard({ project }: ProjectCardProps) {
  const t = useTranslations("projects");
  const locale = useLocale();
  const statusLabel = useStatusLabel(project.status);

  return (
    <Link href={`/${locale}/projects/${project.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="size-5 shrink-0 text-muted-foreground" />
              <CardTitle className="truncate text-base">
                {project.name}
              </CardTitle>
            </div>
            <Badge variant={statusVariant(project.status)}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}

          {project.address && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{project.address}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckSquare className="size-3.5" />
              <span>{t("tasks", { count: project._count.tasks })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              <span>{formatRelativeDate(project.updatedAt, locale)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
