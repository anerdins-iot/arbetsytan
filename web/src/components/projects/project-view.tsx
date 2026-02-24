"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSocketEvent, useJoinProjectRoom, useSocketStatus } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";
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
import { NotesTab } from "./notes-tab";
import type { NoteItem } from "@/actions/notes";
import type { AutomationItem } from "@/actions/automations";
import { AutomationsManager } from "@/components/automations";
import type { RealtimeProjectUpdatedEvent } from "@/lib/socket-events";
import type { PermissionMap } from "@/lib/permissions";

type ProjectViewProps = {
  project: ProjectDetail;
  tasks?: TaskItem[];
  currentUserId: string;
  permissions: PermissionMap;
  commentsByTaskId: Record<string, CommentItem[]>;
  recentActivity: ActivityLogItem[];
  files: FileItem[];
  timeEntries?: GroupedTimeEntries[];
  timeSummary?: ProjectTimeSummary | null;
  notes?: NoteItem[];
  automations?: AutomationItem[];
  initialTab?: "overview" | "tasks" | "files" | "time" | "notes" | "automations";
  initialTaskId?: string;
};

export function ProjectView({
  project,
  tasks = [],
  currentUserId,
  permissions,
  commentsByTaskId,
  recentActivity,
  files,
  timeEntries = [],
  timeSummary = null,
  notes = [],
  automations = [],
  initialTab = "overview",
  initialTaskId,
}: ProjectViewProps) {
  const t = useTranslations("projects");
  const locale = useLocale();
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskOptions = tasks.map((task) => ({ id: task.id, title: task.title }));

  const [socketNoteVersion, setSocketNoteVersion] = useState(0);
  const [socketCategoryVersion, setSocketCategoryVersion] = useState(0);

  const refreshProjectView = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      router.refresh();
    }, 150);
  }, [router]);

  const handleNoteEvent = useCallback(
    (payload: { projectId?: string | null }) => {
      if (payload.projectId === project.id) {
        setSocketNoteVersion((v) => v + 1);
      }
    },
    [project.id]
  );

  const handleNoteCategoryEvent = useCallback(() => {
    setSocketCategoryVersion((v) => v + 1);
  }, []);

  const handleProjectUpdated = useCallback(
    (event: RealtimeProjectUpdatedEvent) => {
      if (event.projectId === project.id && event.newStatus === "ARCHIVED") {
        router.push(`/${locale}/projects`);
        return;
      }
      refreshProjectView();
    },
    [project.id, locale, router, refreshProjectView]
  );

  useSocketEvent(SOCKET_EVENTS.taskCreated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.taskUpdated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.taskDeleted, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.commentCreated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.commentUpdated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.commentDeleted, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.timeEntryCreated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.timeEntryUpdated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.timeEntryDeleted, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.fileCreated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.fileUpdated, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.fileDeleted, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.projectUpdated, handleProjectUpdated);
  useSocketEvent(SOCKET_EVENTS.noteCreated, handleNoteEvent);
  useSocketEvent(SOCKET_EVENTS.noteUpdated, handleNoteEvent);
  useSocketEvent(SOCKET_EVENTS.noteDeleted, handleNoteEvent);
  useSocketEvent(SOCKET_EVENTS.noteCategoryCreated, handleNoteCategoryEvent);
  useSocketEvent(SOCKET_EVENTS.noteCategoryUpdated, handleNoteCategoryEvent);
  useSocketEvent(SOCKET_EVENTS.noteCategoryDeleted, handleNoteCategoryEvent);
  useSocketEvent(SOCKET_EVENTS.projectMemberAdded, refreshProjectView);
  useSocketEvent(SOCKET_EVENTS.projectMemberRemoved, refreshProjectView);

  const joinProjectRoom = useJoinProjectRoom();
  const status = useSocketStatus();

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
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("tabs.tasks")}</TabsTrigger>
          <TabsTrigger value="files">{t("tabs.files")}</TabsTrigger>
          <TabsTrigger value="time">{t("tabs.time")}</TabsTrigger>
          <TabsTrigger value="notes">{t("tabs.notes")}</TabsTrigger>
          <TabsTrigger value="automations">{t("tabs.automations")}</TabsTrigger>
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
            permissions={permissions}
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

        <TabsContent value="notes" className="mt-6">
          <NotesTab
            projectId={project.id}
            initialNotes={notes}
            socketNoteVersion={socketNoteVersion}
            socketCategoryVersion={socketCategoryVersion}
          />
        </TabsContent>

        <TabsContent value="automations" className="mt-6">
          <AutomationsManager initialAutomations={automations} projectId={project.id} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
