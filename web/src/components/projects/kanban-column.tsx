"use client";

import { useDroppable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { KanbanTaskCard } from "./kanban-task-card";
import type { TaskItem } from "@/actions/tasks";
import type { ProjectMember } from "@/actions/projects";

type KanbanColumnProps = {
  status: string;
  tasks: TaskItem[];
  projectId: string;
  members: ProjectMember[];
  isPending: boolean;
  onTaskClick?: (task: TaskItem) => void;
};

export function KanbanColumn({
  status,
  tasks,
  projectId,
  members,
  isPending,
  onTaskClick,
}: KanbanColumnProps) {
  const t = useTranslations("projects.kanban");
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[200px] flex-col rounded-lg border border-border bg-muted/30 p-3 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
        isPending && "opacity-70"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t(`columns.${status}`)}
          </h3>
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border p-4">
            <p className="text-xs text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              members={members}
              onTaskClick={onTaskClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
