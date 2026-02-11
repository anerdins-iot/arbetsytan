import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getProject } from "@/actions/projects";
import { getTasks } from "@/actions/tasks";
import { ProjectView } from "@/components/projects/project-view";

type Props = {
  params: Promise<{ locale: string; projectId: string }>;
};

async function ProjectContent({ projectId }: { projectId: string }) {
  const [projectResult, tasksResult] = await Promise.all([
    getProject(projectId),
    getTasks(projectId),
  ]);

  if (!projectResult.success) {
    notFound();
  }

  const tasks = tasksResult.success ? tasksResult.tasks : [];

  return (
    <ProjectView
      project={projectResult.project}
      tasks={tasks}
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
