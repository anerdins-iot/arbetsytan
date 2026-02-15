import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { getProjects } from "@/actions/projects";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectsListWrapper } from "@/components/projects/projects-list-wrapper";
import { getSession } from "@/lib/auth";
import type { ProjectStatus } from "../../../../../generated/prisma/client";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; status?: string }>;
};

async function ProjectsContent({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) {
  const options: { search?: string; status?: ProjectStatus } = {};
  if (search?.trim()) {
    options.search = search;
  }
  if (status && status !== "ALL") {
    options.status = status as ProjectStatus;
  }
  const { projects } = await getProjects(options);
  return <ProjectList projects={projects} />;
}

export default async function ProjectsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { search, status } = await searchParams;
  const session = await getSession();

  return (
    <ProjectsListWrapper tenantId={session?.tenantId ?? ""}>
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        }
      >
        <ProjectsContent search={search} status={status} />
      </Suspense>
    </ProjectsListWrapper>
  );
}
