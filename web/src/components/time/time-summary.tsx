"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ProjectTimeSummary } from "@/actions/time-entries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateKey, formatMinutes } from "./time-utils";

type TimeSummaryProps = {
  summary: ProjectTimeSummary;
};

export function TimeSummary({ summary }: TimeSummaryProps) {
  const t = useTranslations("time");
  const locale = useLocale();
  const labels = { hour: t("units.shortHours"), minute: t("units.shortMinutes") };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("summary.total")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{formatMinutes(summary.totalMinutes, labels)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("summary.byDay")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.byDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("summary.empty")}</p>
          ) : (
            summary.byDay.slice(0, 5).map((item) => (
              <div key={item.date} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatDateKey(item.date, locale)}
                </span>
                <span className="font-medium">{formatMinutes(item.totalMinutes, labels)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("summary.byWeek")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.byWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("summary.empty")}</p>
          ) : (
            summary.byWeek.slice(0, 5).map((item) => (
              <div key={item.weekStart} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("summary.weekStarting", {
                    date: formatDateKey(item.weekStart, locale),
                  })}
                </span>
                <span className="font-medium">{formatMinutes(item.totalMinutes, labels)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t("summary.byTask")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.byTask.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("summary.empty")}</p>
          ) : (
            summary.byTask.slice(0, 10).map((item) => (
              <div key={item.taskId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.taskTitle}</span>
                <span className="font-medium">{formatMinutes(item.totalMinutes, labels)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("summary.byPerson")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.byPerson.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("summary.empty")}</p>
          ) : (
            summary.byPerson.map((item) => (
              <div key={item.userId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.userName}</span>
                <span className="font-medium">{formatMinutes(item.totalMinutes, labels)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
