"use client";

import { useState, useTransition } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  GripVertical,
  Calendar,
  AlertCircle,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { assignTask, unassignTask } from "@/actions/tasks";
import type { TaskItem } from "@/actions/tasks";
import type { ProjectMember } from "@/actions/projects";

type KanbanTaskCardProps = {
  task: TaskItem;
  projectId: string;
  members: ProjectMember[];
  canAssignTasks?: boolean;
  isDragging?: boolean;
  onTaskClick?: (task: TaskItem) => void;
};

const priorityVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "default",
  URGENT: "destructive",
};

export function KanbanTaskCard({
  task,
  projectId,
  members,
  canAssignTasks = true,
  isDragging = false,
  onTaskClick,
}: KanbanTaskCardProps) {
  const t = useTranslations("projects.kanban");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const isOverdue =
    task.deadline && new Date(task.deadline) < new Date() && task.status !== "DONE";

  function handleAssign(membershipId: string) {
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

  // Members not yet assigned to this task
  const unassignedMembers = members.filter(
    (m) => !task.assignments.some((a) => a.membershipId === m.id)
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "rotate-2 shadow-lg opacity-90",
        isPending && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          tabIndex={-1}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <button
            type="button"
            className="text-left text-sm font-medium leading-tight text-foreground hover:text-primary hover:underline"
            onClick={() => onTaskClick?.(task)}
          >
            {task.title}
          </button>

          {task.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={priorityVariant[task.priority] ?? "outline"} className="text-[10px] px-1.5 py-0">
              {t(`priority.${task.priority}`)}
            </Badge>

            {task.deadline && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px]",
                  isOverdue
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {isOverdue ? (
                  <AlertCircle className="size-3" />
                ) : (
                  <Calendar className="size-3" />
                )}
                {new Date(task.deadline).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Assignees - only show assign/unassign UI when user has permission */}
          <div className="flex items-center gap-1">
            {task.assignments.map((a) => (
              <span
                key={a.membershipId}
                className="group inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <User className="size-3" />
                {a.user.name || a.user.email.split("@")[0]}
                {canAssignTasks && (
                  <button
                    onClick={() => handleUnassign(a.membershipId)}
                    className="hidden group-hover:inline-flex"
                    disabled={isPending}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}

            {canAssignTasks && unassignedMembers.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
                    disabled={isPending}
                  >
                    <UserPlus className="size-3" />
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
      </div>
    </div>
  );
}
