import { getTranslations } from "next-intl/server";
import { ProjectCard } from "./project-card";
import { ProjectFilters } from "./project-filters";
import { CreateProjectDialog } from "./create-project-dialog";
import { FolderOpen } from "lucide-react";
import type { ProjectWithCounts } from "@/actions/projects";
import { Suspense } from "react";

type ProjectListProps = {
  projects: ProjectWithCounts[];
};

export async function ProjectList({ projects }: ProjectListProps) {
  const t = await getTranslations("projects");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("description")}</p>
        </div>
        <CreateProjectDialog />
      </div>

      <Suspense>
        <ProjectFilters />
      </Suspense>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <FolderOpen className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {t("empty")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <div className="mt-6">
            <CreateProjectDialog />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
