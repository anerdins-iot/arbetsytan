import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ActivityLogItem } from "@/actions/activity-log";
import { ACTIVITY_ACTIONS, ACTIVITY_ENTITIES } from "@/lib/activity-log";

type ProjectActivityLogProps = {
  locale: string;
  projectName: string;
  projectPath: string;
  currentPage: number;
  totalPages: number;
  total: number;
  currentAction?: string;
  currentEntity?: string;
  items: ActivityLogItem[];
};

function buildUrl(
  projectPath: string,
  params: {
    page?: number;
    action?: string;
    entity?: string;
  }
): string {
  const search = new URLSearchParams();
  if (params.page && params.page > 1) {
    search.set("page", String(params.page));
  }
  if (params.action) {
    search.set("action", params.action);
  }
  if (params.entity) {
    search.set("entity", params.entity);
  }
  const query = search.toString();
  return query ? `${projectPath}/activity?${query}` : `${projectPath}/activity`;
}

function formatDateTime(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale === "sv" ? "sv-SE" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

export async function ProjectActivityLog({
  locale,
  projectName,
  projectPath,
  currentPage,
  totalPages,
  total,
  currentAction,
  currentEntity,
  items,
}: ProjectActivityLogProps) {
  const t = await getTranslations("projects.activity");
  const backLabel = await getTranslations("projects");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={projectPath}>
            <ArrowLeft className="size-4" />
            <span className="sr-only">{backLabel("backToProjects")}</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description", { projectName })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("filters.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="activity-action" className="text-sm font-medium">
                {t("filters.action")}
              </label>
              <select
                id="activity-action"
                name="action"
                defaultValue={currentAction ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{t("filters.allActions")}</option>
                {ACTIVITY_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {t(`actions.${action}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="activity-entity" className="text-sm font-medium">
                {t("filters.entity")}
              </label>
              <select
                id="activity-entity"
                name="entity"
                defaultValue={currentEntity ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{t("filters.allEntities")}</option>
                {ACTIVITY_ENTITIES.map((entity) => (
                  <option key={entity} value={entity}>
                    {t(`entities.${entity}`)}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm">
              {t("filters.apply")}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`${projectPath}/activity`}>{t("filters.clear")}</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title", { count: total })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            items.map((item) => {
              const metadata = formatMetadata(item.metadata);
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {item.actor.name ?? item.actor.email}
                    </span>
                    <span>{t(`actions.${item.action}`)}</span>
                    <Badge variant="secondary">{t(`entities.${item.entity}`)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt, locale)}
                  </p>
                  {metadata ? (
                    <p className="mt-2 break-all text-xs text-muted-foreground">
                      {metadata}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("pagination.page", { page: currentPage, totalPages })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={currentPage <= 1}
          >
            <Link
              href={buildUrl(projectPath, {
                page: Math.max(1, currentPage - 1),
                action: currentAction,
                entity: currentEntity,
              })}
            >
              <ChevronLeft className="mr-1 size-4" />
              {t("pagination.previous")}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={currentPage >= totalPages}
          >
            <Link
              href={buildUrl(projectPath, {
                page: Math.min(totalPages, currentPage + 1),
                action: currentAction,
                entity: currentEntity,
              })}
            >
              {t("pagination.next")}
              <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
