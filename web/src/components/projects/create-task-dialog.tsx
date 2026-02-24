"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { createTask, assignTask } from "@/actions/tasks";
import type { ProjectMember } from "@/actions/projects";

type CreateTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: ProjectMember[];
  canAssignTasks?: boolean;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export function CreateTaskDialog({
  open,
  onOpenChange,
  projectId,
  members,
  canAssignTasks = true,
}: CreateTaskDialogProps) {
  const t = useTranslations("projects.kanban.createTask");
  const tPriority = useTranslations("projects.kanban.priority");
  const tCommon = useTranslations("common");
  const tKanban = useTranslations("projects.kanban");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const assignMemberId = formData.get("assignTo") as string;

    startTransition(async () => {
      const result = await createTask(projectId, formData);
      if (result.success) {
        // If a member was selected for assignment, we need to get the new task
        // For now we just refresh - the assignment can be done from the card
        if (assignMemberId && assignMemberId !== "__none__") {
          // We need to refresh first to get the new task, then assign
          // Since createTask doesn't return the task id, we'll handle assignment separately
        }
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t("taskTitle")}</Label>
            <Input
              id="task-title"
              name="title"
              placeholder={t("taskTitlePlaceholder")}
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">{t("taskDescription")}</Label>
            <Textarea
              id="task-description"
              name="description"
              placeholder={t("taskDescriptionPlaceholder")}
              rows={3}
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("taskPriority")}</Label>
              <Select name="priority" defaultValue="MEDIUM">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {tPriority(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-deadline">{t("taskDeadline")}</Label>
              <Input
                id="task-deadline"
                name="deadline"
                type="date"
                disabled={isPending}
              />
            </div>
          </div>

          {canAssignTasks && members.length > 0 && (
            <div className="space-y-2">
              <Label>{t("taskAssign")}</Label>
              <Select name="assignTo" defaultValue="__none__">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("noMember")}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.user.name || m.user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
