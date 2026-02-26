"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  syncProjectsToDiscord,
  syncSingleProjectToDiscord,
  type ProjectSyncData,
} from "@/actions/discord";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  Circle,
  Hash,
  Loader2,
  RefreshCw,
} from "lucide-react";

type ProjectSyncSectionProps = {
  projects: ProjectSyncData[];
};

export function ProjectSyncSection({ projects }: ProjectSyncSectionProps) {
  const t = useTranslations("settings.discord.projectSync");
  const router = useRouter();
  const [isSyncingAll, startSyncAll] = useTransition();
  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSyncAll() {
    setError(null);
    startSyncAll(async () => {
      const result = await syncProjectsToDiscord();
      if (result.success) {
        router.refresh();
      } else {
        setError(t("errors.syncFailed"));
      }
    });
  }

  function handleSyncProject(projectId: string) {
    setError(null);
    setSyncingProjectId(projectId);
    syncSingleProjectToDiscord(projectId)
      .then((result) => {
        if (result.success) {
          router.refresh();
        } else {
          setError(t("errors.syncFailed"));
        }
      })
      .catch(() => {
        setError(t("errors.syncFailed"));
      })
      .finally(() => {
        setSyncingProjectId(null);
      });
  }

  const syncedCount = projects.filter((p) => p.synced).length;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description", { synced: syncedCount, total: projects.length })}
          </p>
        </div>
        <Button
          onClick={handleSyncAll}
          disabled={isSyncingAll || syncingProjectId !== null}
          size="sm"
        >
          {isSyncingAll ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          {isSyncingAll ? t("syncing") : t("syncAllButton")}
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.project")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.channels")}</TableHead>
                <TableHead>{t("columns.lastSynced")}</TableHead>
                <TableHead className="text-right">
                  {t("columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const isSyncing = syncingProjectId === project.projectId;
                return (
                  <TableRow key={project.projectId}>
                    <TableCell className="font-medium">
                      {project.projectName}
                    </TableCell>
                    <TableCell>
                      {project.synced ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                          <CheckCircle className="size-4" />
                          {t("statusSynced")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Circle className="size-4" />
                          {t("statusNotSynced")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {project.channels.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {project.channels.map((ch) => (
                            <span
                              key={ch.type}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              <Hash className="size-3" />
                              {t(`channelTypes.${ch.type}`)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project.lastSyncedAt
                        ? new Date(project.lastSyncedAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={project.synced ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleSyncProject(project.projectId)}
                        disabled={
                          isSyncing || isSyncingAll || syncingProjectId !== null
                        }
                      >
                        {isSyncing ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : project.synced ? (
                          <RefreshCw className="mr-2 size-4" />
                        ) : null}
                        {isSyncing
                          ? t("syncing")
                          : project.synced
                            ? t("resyncButton")
                            : t("createChannelsButton")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
