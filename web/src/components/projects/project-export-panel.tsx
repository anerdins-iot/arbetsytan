"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  exportProjectSummaryPdf,
  exportTaskListExcel,
  exportTimeReportExcel,
} from "@/actions/export";
import type { ProjectMember } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ExportType = "time" | "tasks" | "summary";

type ProjectExportPanelProps = {
  projectId: string;
  members: ProjectMember[];
};

function resolveErrorMessage(errorCode: string, t: ReturnType<typeof useTranslations>): string {
  switch (errorCode) {
    case "VALIDATION_ERROR":
      return t("errors.validation");
    case "PROJECT_NOT_FOUND":
      return t("errors.projectNotFound");
    case "FORBIDDEN":
      return t("errors.forbidden");
    default:
      return t("errors.generic");
  }
}

export function ProjectExportPanel({ projectId, members }: ProjectExportPanelProps) {
  const t = useTranslations("export");
  const [isPending, startTransition] = useTransition();
  const [activeExport, setActiveExport] = useState<ExportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  const uniqueMembers = members.filter(
    (member, index, array) =>
      array.findIndex((other) => other.user.id === member.user.id) === index
  );

  function openDownload(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function runExport(kind: ExportType): void {
    setError(null);
    setActiveExport(kind);

    startTransition(async () => {
      try {
        if (kind === "summary") {
          const result = await exportProjectSummaryPdf(projectId);
          if (!result.success) {
            setError(resolveErrorMessage(result.error, t));
            return;
          }
          openDownload(result.downloadUrl);
          return;
        }

        if (kind === "tasks") {
          const result = await exportTaskListExcel(projectId);
          if (!result.success) {
            setError(resolveErrorMessage(result.error, t));
            return;
          }
          openDownload(result.downloadUrl);
          return;
        }

        const result = await exportTimeReportExcel(projectId, {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          userId: selectedUserId !== "all" ? selectedUserId : undefined,
        });
        if (!result.success) {
          setError(resolveErrorMessage(result.error, t));
          return;
        }
        openDownload(result.downloadUrl);
      } finally {
        setActiveExport(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="export-from-date">{t("filters.fromDate")}</Label>
            <Input
              id="export-from-date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-to-date">{t("filters.toDate")}</Label>
            <Input
              id="export-to-date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("filters.person")}</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allPeople")}</SelectItem>
                {uniqueMembers.map((member) => (
                  <SelectItem key={member.user.id} value={member.user.id}>
                    {member.user.name ?? member.user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => runExport("time")}
          >
            {isPending && activeExport === "time" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("loading")}
              </>
            ) : (
              t("actions.timeReportExcel")
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => runExport("tasks")}
          >
            {isPending && activeExport === "tasks" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("loading")}
              </>
            ) : (
              t("actions.taskListExcel")
            )}
          </Button>

          <Button type="button" disabled={isPending} onClick={() => runExport("summary")}>
            {isPending && activeExport === "summary" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("loading")}
              </>
            ) : (
              t("actions.projectSummaryPdf")
            )}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
