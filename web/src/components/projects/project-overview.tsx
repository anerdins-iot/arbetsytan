"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Calendar,
  Pencil,
  ListTodo,
  Loader2,
  CheckCircle2,
  Clock,
  CircleDot,
  Users,
  UserPlus,
  Trash2,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { updateProject, addProjectMember, removeProjectMember } from "@/actions/projects";
import type { ProjectDetail } from "@/actions/projects";
import type { ActivityLogItem } from "@/actions/activity-log";
import { formatActivityMetadata } from "@/lib/format-activity-metadata";

type ProjectOverviewProps = {
  project: ProjectDetail;
  recentActivity: ActivityLogItem[];
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

function useRoleLabel(role: string) {
  const t = useTranslations("projects.overview");
  switch (role) {
    case "ADMIN":
      return t("roleAdmin");
    case "PROJECT_MANAGER":
      return t("roleProjectManager");
    case "WORKER":
      return t("roleWorker");
    default:
      return role;
  }
}

function formatDate(date: Date, locale: string): string {
  return new Date(date).toLocaleDateString(
    locale === "sv" ? "sv-SE" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
}

export function ProjectOverview({ project, recentActivity }: ProjectOverviewProps) {
  const t = useTranslations("projects");
  const tActivity = useTranslations("projects.activity");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>("");
  const [teamPending, setTeamPending] = useState(false);
  const statusLabel = useStatusLabel(project.status);

  const totalTasks =
    project.taskStatusCounts.TODO +
    project.taskStatusCounts.IN_PROGRESS +
    project.taskStatusCounts.DONE;

  function handleUpdate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateProject(project.id, formData);
      if (result.success) {
        setEditOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? t("errorGeneric"));
      }
    });
  }

  function handleAddMember() {
    if (!selectedMembershipId) return;
    setTeamError(null);
    setTeamPending(true);
    addProjectMember(project.id, selectedMembershipId).then((result) => {
      setTeamPending(false);
      if (result.success) {
        setSelectedMembershipId("");
        router.refresh();
      } else {
        const key =
          result.error === "ALREADY_MEMBER"
            ? "overview.errorAlreadyMember"
            : result.error === "MEMBER_NOT_FOUND"
              ? "overview.errorMemberNotFound"
              : result.error === "FORBIDDEN"
                ? "overview.errorForbidden"
                : "errorGeneric";
        setTeamError(t(key));
      }
    });
  }

  function handleRemoveMember(membershipId: string, name: string) {
    const message = t("overview.removeConfirm", { name });
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    setTeamError(null);
    setTeamPending(true);
    removeProjectMember(project.id, membershipId).then((result) => {
      setTeamPending(false);
      if (result.success) {
        router.refresh();
      } else {
        setTeamError(
          result.error === "FORBIDDEN" ? t("overview.errorForbidden") : t("errorGeneric")
        );
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left column: Project info + Task stats */}
      <div className="space-y-6 lg:col-span-2">
        {/* Project info card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {t("overview.projectInfo")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1.5 size-3.5" />
                {tCommon("edit")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(project.status)}>
                {statusLabel}
              </Badge>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                {project.description || t("overview.noDescription")}
              </p>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground" />
                <span>
                  {project.address || t("overview.noAddress")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-muted-foreground" />
                <span>
                  {t("overview.created")}: {formatDate(project.createdAt, locale)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task stats card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="size-5" />
              {t("overview.taskStats")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border p-4 text-center">
                <CircleDot className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-2xl font-bold text-foreground">
                  {project.taskStatusCounts.TODO}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("overview.todo")}
                </p>
              </div>
              <div className="rounded-lg border border-border p-4 text-center">
                <Clock className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-2xl font-bold text-foreground">
                  {project.taskStatusCounts.IN_PROGRESS}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("overview.inProgress")}
                </p>
              </div>
              <div className="rounded-lg border border-border p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-2xl font-bold text-foreground">
                  {project.taskStatusCounts.DONE}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("overview.done")}
                </p>
              </div>
              <div className="rounded-lg border border-border p-4 text-center">
                <ListTodo className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-2xl font-bold text-foreground">
                  {totalTasks}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("overview.totalTasks")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="size-5" />
                {tActivity("recentTitle")}
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${locale}/projects/${project.id}/activity`}>
                  {tActivity("viewAll")}
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tActivity("empty")}</p>
            ) : (
              recentActivity.map((item) => {
                const metadata = formatActivityMetadata(item.metadata, {
                  entity: item.entity,
                  action: item.action,
                  locale,
                });

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {item.actor.name ?? item.actor.email}
                      </span>
                      <span>{tActivity(`actions.${item.action}`)}</span>
                      <Badge variant="secondary">
                        {tActivity(`entities.${item.entity}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString(
                        locale === "sv" ? "sv-SE" : "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
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
      </div>

      {/* Right column: Members */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              {t("overview.members")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.canManageTeam && project.availableMembers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedMembershipId}
                  onValueChange={setSelectedMembershipId}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("overview.selectMember")} />
                  </SelectTrigger>
                  <SelectContent>
                    {project.availableMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.user.name ?? m.user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleAddMember}
                  disabled={!selectedMembershipId || teamPending}
                >
                  {teamPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      {t("overview.adding")}
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-1.5 size-3.5" />
                      {t("overview.add")}
                    </>
                  )}
                </Button>
              </div>
            )}
            {teamError && (
              <p className="text-sm text-destructive">{teamError}</p>
            )}
            {project.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("overview.noMembers")}
              </p>
            ) : (
              <div className="space-y-3">
                {project.members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    canRemove={project.canManageTeam}
                    onRemove={
                      project.canManageTeam
                        ? () =>
                            handleRemoveMember(
                              member.id,
                              member.user.name ?? member.user.email
                            )
                        : undefined
                    }
                    isRemoving={teamPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <EditProjectDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleUpdate}
        isPending={isPending}
        error={error}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────

function MemberRow({
  member,
  canRemove,
  onRemove,
  isRemoving,
}: {
  member: ProjectDetail["members"][number];
  canRemove: boolean;
  onRemove?: () => void;
  isRemoving: boolean;
}) {
  const tOverview = useTranslations("projects.overview");
  const roleLabel = useRoleLabel(member.role);
  const initials = (member.user.name ?? member.user.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {member.user.name ?? member.user.email}
        </p>
        <p className="text-xs text-muted-foreground">{roleLabel}</p>
      </div>
      {canRemove && onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={isRemoving}
          aria-label={tOverview("remove")}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  error,
}: {
  project: ProjectDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
  error: string | null;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
          <DialogDescription>{t("edit.description")}</DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t("name")}</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={project.name}
              required
              maxLength={200}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">
              {t("projectDescription")}
            </Label>
            <Textarea
              id="edit-description"
              name="description"
              defaultValue={project.description ?? ""}
              maxLength={2000}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">{t("address")}</Label>
            <Input
              id="edit-address"
              name="address"
              defaultValue={project.address ?? ""}
              maxLength={500}
              placeholder={t("addressPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">{t("edit.status")}</Label>
            <Select name="status" defaultValue={project.status}>
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">
                  {t("statusActive")}
                </SelectItem>
                <SelectItem value="PAUSED">
                  {t("statusPaused")}
                </SelectItem>
                <SelectItem value="COMPLETED">
                  {t("statusCompleted")}
                </SelectItem>
                <SelectItem value="ARCHIVED">
                  {t("statusArchived")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  {t("edit.saving")}
                </>
              ) : (
                tCommon("save")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
