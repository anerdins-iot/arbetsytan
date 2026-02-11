"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectOverview } from "./project-overview";
import { KanbanBoard } from "./kanban-board";
import type { ProjectDetail } from "@/actions/projects";
import type { TaskItem } from "@/actions/tasks";
import type { CommentItem } from "@/actions/comments";
import type { ActivityLogItem } from "@/actions/activity-log";

type ProjectViewProps = {
  project: ProjectDetail;
  tasks?: TaskItem[];
  currentUserId: string;
  commentsByTaskId: Record<string, CommentItem[]>;
  recentActivity: ActivityLogItem[];
};

export function ProjectView({
  project,
  tasks = [],
  currentUserId,
  commentsByTaskId,
  recentActivity,
}: ProjectViewProps) {
  const t = useTranslations("projects");
  const locale = useLocale();

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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("tabs.tasks")}</TabsTrigger>
          <TabsTrigger value="files">{t("tabs.files")}</TabsTrigger>
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
          />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-muted-foreground">{t("tabs.files")}</p>
          </div>
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
