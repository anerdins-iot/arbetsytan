"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Calendar,
  AlertCircle,
  User,
  UserPlus,
  X,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  updateTask,
  deleteTask,
  assignTask,
  unassignTask,
} from "@/actions/tasks";
import type { TaskItem } from "@/actions/tasks";
import type { ProjectMember } from "@/actions/projects";
import type { CommentItem } from "@/actions/comments";
import { TaskComments } from "./task-comments";

type TaskDetailSheetProps = {
  task: TaskItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: ProjectMember[];
  currentUserId: string;
  commentsByTaskId: Record<string, CommentItem[]>;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

const priorityVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "default",
  URGENT: "destructive",
};

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  projectId,
  members,
  currentUserId,
  commentsByTaskId,
}: TaskDetailSheetProps) {
  const t = useTranslations("projects.kanban");
  const tDetail = useTranslations("projects.taskDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!task) return null;

  const isOverdue =
    task.deadline &&
    new Date(task.deadline) < new Date() &&
    task.status !== "DONE";

  const unassignedMembers = members.filter(
    (m) => !task.assignments.some((a) => a.membershipId === m.id)
  );

  function handleSave(formData: FormData) {
    if (!task) return;

    startTransition(async () => {
      const result = await updateTask(projectId, {
        taskId: task.id,
        title: formData.get("title") as string,
        description: (formData.get("description") as string) || undefined,
        priority: formData.get("priority") as string,
        status: formData.get("status") as string,
        deadline: (formData.get("deadline") as string) || undefined,
      });
      if (result.success) {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!task) return;

    startTransition(async () => {
      const result = await deleteTask(projectId, { taskId: task.id });
      if (result.success) {
        onOpenChange(false);
        setShowDeleteConfirm(false);
        router.refresh();
      }
    });
  }

  function handleAssign(membershipId: string) {
    if (!task) return;

    startTransition(async () => {
      const result = await assignTask(projectId, {
        taskId: task.id,
        membershipId,
      });
      if (result.success) {
        router.refresh();
      }
    });
  }

  function handleUnassign(membershipId: string) {
    if (!task) return;

    startTransition(async () => {
      const result = await unassignTask(projectId, {
        taskId: task.id,
        membershipId,
      });
      if (result.success) {
        router.refresh();
      }
    });
  }

  const deadlineValue = task.deadline
    ? new Date(task.deadline).toISOString().split("T")[0]
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{tDetail("title")}</SheetTitle>
          <SheetDescription>{tDetail("description")}</SheetDescription>
        </SheetHeader>

        <form action={handleSave} className="flex flex-1 flex-col gap-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="detail-title">{tDetail("taskTitle")}</Label>
            <Input
              id="detail-title"
              name="title"
              defaultValue={task.title}
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="detail-description">
              {tDetail("taskDescription")}
            </Label>
            <Textarea
              id="detail-description"
              name="description"
              defaultValue={task.description ?? ""}
              rows={4}
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tDetail("taskPriority")}</Label>
              <Select name="priority" defaultValue={task.priority}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`priority.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{tDetail("taskStatus")}</Label>
              <Select name="status" defaultValue={task.status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`columns.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="detail-deadline">{tDetail("taskDeadline")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="detail-deadline"
                name="deadline"
                type="date"
                defaultValue={deadlineValue}
                disabled={isPending}
              />
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="size-3" />
                  {t("overdue")}
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Assignees section */}
          <div className="space-y-2">
            <Label>{tDetail("assignees")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {task.assignments.map((a) => (
                <span
                  key={a.membershipId}
                  className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                >
                  <User className="size-3" />
                  {a.user.name || a.user.email.split("@")[0]}
                  <button
                    type="button"
                    onClick={() => handleUnassign(a.membershipId)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive"
                    disabled={isPending}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}

              {task.assignments.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("unassigned")}
                </span>
              )}

              {unassignedMembers.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                      disabled={isPending}
                    >
                      <UserPlus className="size-3" />
                      {tDetail("addAssignee")}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {unassignedMembers.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onSelect={() => handleAssign(m.id)}
                      >
                        <User className="mr-2 size-4" />
                        {m.user.name || m.user.email}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <Separator />

          {/* Metadata */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {tDetail("created")}:{" "}
              {new Date(task.createdAt).toLocaleDateString()}
            </p>
            <p>
              {tDetail("updated")}:{" "}
              {new Date(task.updatedAt).toLocaleDateString()}
            </p>
          </div>

          <Separator />

          {/* Comments */}
          <TaskComments
            key={task.id}
            taskId={task.id}
            projectId={projectId}
            currentUserId={currentUserId}
            initialComments={commentsByTaskId[task.id] ?? []}
          />

          <SheetFooter className="p-0 flex-row gap-2">
            {showDeleteConfirm ? (
              <div className="flex w-full items-center gap-2">
                <span className="text-sm text-destructive">
                  {tDetail("deleteConfirm")}
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  {isPending ? tCommon("loading") : tCommon("delete")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isPending}
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1 size-4" />
                  {tCommon("delete")}
                </Button>
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? tDetail("saving") : tCommon("save")}
                </Button>
              </>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
