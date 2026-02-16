import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getProject } from "@/actions/projects";
import { getActivityLog } from "@/actions/activity-log";
import { ProjectActivityLog } from "@/components/projects/project-activity-log";
import { ProjectActivityRealtimeWrapper } from "@/components/projects/project-activity-realtime-wrapper";

type Props = {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<{
    page?: string;
    action?: string;
    entity?: string;
  }>;
};

export default async function ProjectActivityPage({ params, searchParams }: Props) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);

  const { page, action, entity } = await searchParams;
  const [projectResult, activityResult] = await Promise.all([
    getProject(projectId),
    getActivityLog(projectId, {
      page,
      pageSize: 20,
      action: action as
        | "created"
        | "updated"
        | "deleted"
        | "completed"
        | "assigned"
        | "uploaded"
        | "statusChanged"
        | "added"
        | "removed"
        | undefined,
      entity: entity as "task" | "project" | "file" | "member" | "comment" | undefined,
    }),
  ]);

  if (!projectResult.success) {
    notFound();
  }

  if (!activityResult.success) {
    notFound();
  }

  const projectPath = `/${locale}/projects/${projectId}`;

  return (
    <ProjectActivityRealtimeWrapper projectId={projectId}>
      <ProjectActivityLog
        locale={locale}
        projectName={projectResult.project.name}
        projectPath={projectPath}
        currentPage={activityResult.page}
        totalPages={activityResult.totalPages}
        total={activityResult.total}
        currentAction={action}
        currentEntity={entity}
        items={activityResult.items}
      />
    </ProjectActivityRealtimeWrapper>
  );
}
