import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getProject } from "@/actions/projects";
import { getTasks } from "@/actions/tasks";
import { getCommentsByTask } from "@/actions/comments";
import { getActivityLog } from "@/actions/activity-log";
import { getProjectFiles } from "@/actions/files";
import { getProjectTimeSummary, getTimeEntriesByProject } from "@/actions/time-entries";
import { getSession } from "@/lib/auth";
import { ProjectView } from "@/components/projects/project-view";

type Props = {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<{ tab?: string; taskId?: string }>;
};

async function ProjectContent({
  projectId,
  initialTab,
  initialTaskId,
}: {
  projectId: string;
  initialTab?: "overview" | "tasks" | "files" | "time" | "ai";
  initialTaskId?: string;
}) {
  const [
    projectResult,
    tasksResult,
    session,
    activityResult,
    filesResult,
    timeEntriesResult,
    timeSummaryResult,
  ] = await Promise.all([
    getProject(projectId),
    getTasks(projectId),
    getSession(),
    getActivityLog(projectId, { page: 1, pageSize: 5 }),
    getProjectFiles(projectId),
    getTimeEntriesByProject(projectId),
    getProjectTimeSummary(projectId),
  ]);

  if (!projectResult.success || !session) {
    notFound();
  }

  const tasks = tasksResult.success ? tasksResult.tasks : [];
  const commentsResult = await getCommentsByTask(
    projectId,
    tasks.map((task) => task.id)
  );
  const commentsByTaskId = commentsResult.success
    ? commentsResult.commentsByTaskId
    : {};

  return (
    <ProjectView
      project={projectResult.project}
      tasks={tasks}
      currentUserId={session.user.id}
      commentsByTaskId={commentsByTaskId}
      recentActivity={activityResult.success ? activityResult.items : []}
      files={filesResult.success ? filesResult.files : []}
      timeEntries={timeEntriesResult.success ? timeEntriesResult.data : []}
      timeSummary={timeSummaryResult.success ? timeSummaryResult.data : null}
      initialTab={initialTab}
      initialTaskId={initialTaskId}
    />
  );
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { locale, projectId } = await params;
  const { tab, taskId } = await searchParams;
  setRequestLocale(locale);

  const validTabs = new Set(["overview", "tasks", "files", "time", "ai"]);
  const initialTab =
    tab && validTabs.has(tab)
      ? (tab as "overview" | "tasks" | "files" | "time" | "ai")
      : undefined;
  const initialTaskId = taskId?.trim() ? taskId : undefined;

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      }
    >
      <ProjectContent
        projectId={projectId}
        initialTab={initialTab}
        initialTaskId={initialTaskId}
      />
    </Suspense>
  );
}
