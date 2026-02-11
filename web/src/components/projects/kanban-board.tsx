"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, GripVertical, Calendar, AlertCircle, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { updateTaskStatus } from "@/actions/tasks";
import type { TaskItem, TaskAssignee } from "@/actions/tasks";
import type { ProjectMember } from "@/actions/projects";
import { KanbanColumn } from "./kanban-column";
import { KanbanTaskCard } from "./kanban-task-card";
import { CreateTaskDialog } from "./create-task-dialog";

type KanbanBoardProps = {
  tasks: TaskItem[];
  projectId: string;
  members: ProjectMember[];
};

const COLUMNS = ["TODO", "IN_PROGRESS", "DONE"] as const;
type ColumnStatus = (typeof COLUMNS)[number];

export function KanbanBoard({ tasks, projectId, members }: KanbanBoardProps) {
  const t = useTranslations("projects.kanban");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const tasksByStatus: Record<ColumnStatus, TaskItem[]> = {
    TODO: tasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS"),
    DONE: tasks.filter((t) => t.status === "DONE"),
  };

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // The over target is a column id (status)
    const newStatus = over.id as string;
    if (!COLUMNS.includes(newStatus as ColumnStatus)) return;
    if (task.status === newStatus) return;

    startTransition(async () => {
      const result = await updateTaskStatus(projectId, {
        taskId,
        status: newStatus,
      });
      if (result.success) {
        router.refresh();
      }
    });
  }

  if (tasks.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" />
            {t("addTask")}
          </Button>
        </div>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-muted-foreground">{t("emptyBoard")}</p>
        </div>
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={projectId}
          members={members}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" />
          {t("addTask")}
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              projectId={projectId}
              members={members}
              isPending={isPending}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <KanbanTaskCard
              task={activeTask}
              projectId={projectId}
              members={members}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        members={members}
      />
    </div>
  );
}
