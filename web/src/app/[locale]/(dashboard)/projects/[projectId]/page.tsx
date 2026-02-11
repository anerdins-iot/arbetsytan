import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getProject } from "@/actions/projects";
import { getTasks } from "@/actions/tasks";
import { getCommentsByTask } from "@/actions/comments";
import { getSession } from "@/lib/auth";
import { ProjectView } from "@/components/projects/project-view";

type Props = {
  params: Promise<{ locale: string; projectId: string }>;
};

async function ProjectContent({ projectId }: { projectId: string }) {
  const [projectResult, tasksResult, session] = await Promise.all([
    getProject(projectId),
    getTasks(projectId),
    getSession(),
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
    />
  );
}

export default async function ProjectPage({ params }: Props) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      }
    >
      <ProjectContent projectId={projectId} />
    </Suspense>
  );
}
