"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSocket } from "@/hooks/use-socket";
import { ProjectOverview } from "./project-overview";
import { KanbanBoard } from "./kanban-board";
import { ProjectFilesUpload } from "./project-files-upload";
import type { ProjectDetail } from "@/actions/projects";
import type { TaskItem } from "@/actions/tasks";
import type { CommentItem } from "@/actions/comments";
import type { ActivityLogItem } from "@/actions/activity-log";
import type { FileItem } from "@/actions/files";
import type { GroupedTimeEntries, ProjectTimeSummary } from "@/actions/time-entries";
import { TimeEntryForm } from "@/components/time/time-entry-form";
import { TimeEntryList } from "@/components/time/time-entry-list";
import { TimeSummary } from "@/components/time/time-summary";
import { ProjectExportPanel } from "./project-export-panel";

type ProjectViewProps = {
  project: ProjectDetail;
  tasks?: TaskItem[];
  currentUserId: string;
  commentsByTaskId: Record<string, CommentItem[]>;
  recentActivity: ActivityLogItem[];
  files: FileItem[];
  timeEntries?: GroupedTimeEntries[];
  timeSummary?: ProjectTimeSummary | null;
  initialTab?: "overview" | "tasks" | "files" | "time" | "ai";
  initialTaskId?: string;
};

export function ProjectView({
  project,
  tasks = [],
  currentUserId,
  commentsByTaskId,
  recentActivity,
  files,
  timeEntries = [],
  timeSummary = null,
  initialTab = "overview",
  initialTaskId,
}: ProjectViewProps) {
  const t = useTranslations("projects");
  const locale = useLocale();
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskOptions = tasks.map((task) => ({ id: task.id, title: task.title }));

  const refreshProjectView = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      router.refresh();
    }, 150);
  }, [router]);

  const { status, joinProjectRoom } = useSocket({
    enabled: true,
    onTaskCreated: refreshProjectView,
    onTaskUpdated: refreshProjectView,
    onTaskDeleted: refreshProjectView,
    onFileCreated: refreshProjectView,
    onFileDeleted: refreshProjectView,
    onProjectUpdated: refreshProjectView,
  });

  useEffect(() => {
    if (status !== "connected") return;
    void joinProjectRoom(project.id);
  }, [joinProjectRoom, project.id, status]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/${locale}/projects`}>
            <ArrowLeft className="size-4" />
            <span className="sr-only">{t("backToProjects")}</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{project.name}</h1>
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("tabs.tasks")}</TabsTrigger>
          <TabsTrigger value="files">{t("tabs.files")}</TabsTrigger>
          <TabsTrigger value="time">{t("tabs.time")}</TabsTrigger>
          <TabsTrigger value="ai">{t("tabs.ai")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ProjectOverview project={project} recentActivity={recentActivity} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <KanbanBoard
            tasks={tasks}
            projectId={project.id}
            members={project.members}
            currentUserId={currentUserId}
            commentsByTaskId={commentsByTaskId}
            initialTaskId={initialTaskId}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <ProjectFilesUpload projectId={project.id} initialFiles={files} />
        </TabsContent>

        <TabsContent value="time" className="mt-6 space-y-6">
          <TimeEntryForm tasks={taskOptions} />
          <ProjectExportPanel projectId={project.id} members={project.members} />
          {timeSummary ? <TimeSummary summary={timeSummary} /> : null}
          <TimeEntryList groupedEntries={timeEntries} tasks={taskOptions} />
        </TabsContent>

        <TabsContent value="ai" className="mt-6">
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-muted-foreground">{t("tabs.ai")}</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
