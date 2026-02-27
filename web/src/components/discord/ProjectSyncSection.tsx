"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  syncProjectsToDiscord,
  syncSingleProjectToDiscord,
  setProjectChannelSyncEnabled,
  unlinkProjectChannel,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  Circle,
  Hash,
  Loader2,
  RefreshCw,
  Settings2,
  Unlink,
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

  // Sheet state
  const [selectedProject, setSelectedProject] =
    useState<ProjectSyncData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Per-channel loading states
  const [togglingChannelId, setTogglingChannelId] = useState<string | null>(
    null
  );
  const [unlinkingChannelId, setUnlinkingChannelId] = useState<string | null>(
    null
  );

  // AlertDialog state for unlink confirmation
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    channelId: string;
    channelType: string;
  } | null>(null);

  function handleSyncAll() {
    setError(null);
    startSyncAll(async () => {
      const result = await syncProjectsToDiscord();
      if (result.success) {
        toast.success(t("toasts.syncAllSuccess"));
        router.refresh();
      } else {
        toast.error(t("errors.syncFailed"));
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
          toast.success(t("toasts.syncProjectSuccess"));
          router.refresh();
        } else {
          toast.error(t("errors.syncFailed"));
          setError(t("errors.syncFailed"));
        }
      })
      .catch(() => {
        toast.error(t("errors.syncFailed"));
        setError(t("errors.syncFailed"));
      })
      .finally(() => {
        setSyncingProjectId(null);
      });
  }

  function handleOpenSheet(project: ProjectSyncData) {
    setSelectedProject(project);
    setSheetOpen(true);
  }

  function handleToggleSync(
    projectId: string,
    discordChannelId: string,
    enabled: boolean
  ) {
    setTogglingChannelId(discordChannelId);
    setProjectChannelSyncEnabled(projectId, discordChannelId, enabled)
      .then((result) => {
        if (result.success) {
          toast.success(
            enabled
              ? t("toasts.syncEnabled")
              : t("toasts.syncDisabled")
          );
          // Update local state so the sheet reflects the change
          if (selectedProject && selectedProject.projectId === projectId) {
            setSelectedProject({
              ...selectedProject,
              channels: selectedProject.channels.map((ch) =>
                ch.channelId === discordChannelId
                  ? { ...ch, syncEnabled: enabled }
                  : ch
              ),
            });
          }
          router.refresh();
        } else {
          toast.error(t("errors.toggleFailed"));
        }
      })
      .catch(() => {
        toast.error(t("errors.toggleFailed"));
      })
      .finally(() => {
        setTogglingChannelId(null);
      });
  }

  function handleRequestUnlink(channelId: string, channelType: string) {
    setUnlinkTarget({ channelId, channelType });
    setUnlinkDialogOpen(true);
  }

  function handleConfirmUnlink() {
    if (!selectedProject || !unlinkTarget) return;

    const { channelId } = unlinkTarget;
    setUnlinkingChannelId(channelId);
    setUnlinkDialogOpen(false);

    unlinkProjectChannel(selectedProject.projectId, channelId)
      .then((result) => {
        if (result.success) {
          toast.success(t("toasts.unlinkSuccess"));
          // Update local state to remove the channel
          const updatedChannels = selectedProject.channels.filter(
            (ch) => ch.channelId !== channelId
          );
          if (updatedChannels.length === 0) {
            setSheetOpen(false);
            setSelectedProject(null);
          } else {
            setSelectedProject({
              ...selectedProject,
              synced: updatedChannels.length > 0,
              channels: updatedChannels,
            });
          }
          router.refresh();
        } else {
          toast.error(t("errors.unlinkFailed"));
        }
      })
      .catch(() => {
        toast.error(t("errors.unlinkFailed"));
      })
      .finally(() => {
        setUnlinkingChannelId(null);
        setUnlinkTarget(null);
      });
  }

  function truncateChannelId(id: string) {
    if (id.length <= 12) return id;
    return `${id.slice(0, 6)}…${id.slice(-4)}`;
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
          className="min-h-11"
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
                      <div className="inline-flex items-center gap-2">
                        {project.synced ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => handleOpenSheet(project)}
                          >
                            <Settings2 className="mr-2 size-4" />
                            {t("configureButton")}
                          </Button>
                        ) : null}
                        <Button
                          variant={project.synced ? "ghost" : "default"}
                          size="sm"
                          className="min-h-11"
                          onClick={() => handleSyncProject(project.projectId)}
                          disabled={
                            isSyncing ||
                            isSyncingAll ||
                            syncingProjectId !== null
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Channel Configuration Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {selectedProject?.projectName ?? ""}
            </SheetTitle>
            <SheetDescription>
              {t("sheetDescription")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {selectedProject?.channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noChannels")}
              </p>
            ) : (
              <div className="space-y-6">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("channelLinksTitle")}
                </h3>
                <div className="space-y-4">
                  {selectedProject?.channels.map((ch) => {
                    const isToggling = togglingChannelId === ch.channelId;
                    const isUnlinking = unlinkingChannelId === ch.channelId;

                    return (
                      <div
                        key={ch.recordId}
                        className="rounded-lg border border-border p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Hash className="size-4 shrink-0 text-muted-foreground" />
                              <span className="font-medium">
                                {t(`channelTypes.${ch.type}`)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("channelIdLabel")}:{" "}
                              <code className="rounded bg-muted px-1 py-0.5">
                                {truncateChannelId(ch.channelId)}
                              </code>
                            </p>
                            {ch.type === "tasks" ? (
                              <p className="text-xs text-muted-foreground/80">
                                {t("taskNotificationsHelp")}
                              </p>
                            ) : null}
                            {ch.lastSyncedAt ? (
                              <p className="text-xs text-muted-foreground">
                                {t("columns.lastSynced")}:{" "}
                                {new Date(ch.lastSyncedAt).toLocaleString()}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex min-h-11 items-center gap-2">
                            <Label
                              htmlFor={`sync-${ch.recordId}`}
                              className="text-xs text-muted-foreground"
                            >
                              {t("syncToggle")}
                            </Label>
                            <Switch
                              id={`sync-${ch.recordId}`}
                              checked={ch.syncEnabled}
                              disabled={isToggling || isUnlinking}
                              onCheckedChange={(checked) =>
                                handleToggleSync(
                                  selectedProject!.projectId,
                                  ch.channelId,
                                  checked
                                )
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 text-destructive hover:text-destructive"
                            onClick={() =>
                              handleRequestUnlink(ch.channelId, ch.type)
                            }
                            disabled={isUnlinking || isToggling}
                          >
                            {isUnlinking ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <Unlink className="mr-2 size-4" />
                            )}
                            {t("unlink")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Unlink Confirmation AlertDialog */}
      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("unlinkDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("unlinkDialogDescription", {
                channelType: unlinkTarget
                  ? t(`channelTypes.${unlinkTarget.channelType}`)
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnlink}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Unlink className="mr-2 size-4" />
              {t("unlink")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
