import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getMyTimeEntries } from "@/actions/time-entries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/components/time/time-utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
};

type Period = "this_week" | "last_week" | "this_month" | "all";

function getPeriodRange(period: Period): { start: Date; end: Date } | null {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);

  if (period === "this_week") {
    const end = new Date(thisMonday);
    end.setDate(thisMonday.getDate() + 7);
    return { start: thisMonday, end };
  }

  if (period === "last_week") {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - 7);
    return { start, end: thisMonday };
  }

  if (period === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  return null;
}

export default async function MyTimePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { period } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "time" });
  const labels = { hour: t("units.shortHours"), minute: t("units.shortMinutes") };

  const periodValue: Period =
    period === "last_week" || period === "this_month" || period === "all"
      ? period
      : "this_week";

  const entriesResult = await getMyTimeEntries();
  const allEntries = entriesResult.success ? entriesResult.data : [];
  const range = getPeriodRange(periodValue);

  const filteredEntries = range
    ? allEntries.filter((entry) => {
        const date = new Date(entry.date);
        return date >= range.start && date < range.end;
      })
    : allEntries;

  const totalMinutes = filteredEntries.reduce((sum, entry) => sum + entry.minutes, 0);

  const projectTotals = new Map<string, { projectId: string; projectName: string; totalMinutes: number }>();
  for (const entry of filteredEntries) {
    const current = projectTotals.get(entry.projectId);
    if (!current) {
      projectTotals.set(entry.projectId, {
        projectId: entry.projectId,
        projectName: entry.projectName,
        totalMinutes: entry.minutes,
      });
    } else {
      current.totalMinutes += entry.minutes;
    }
  }

  const byProject = Array.from(projectTotals.values()).sort(
    (a, b) => b.totalMinutes - a.totalMinutes
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("myTimes.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("myTimes.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${locale}/time?period=this_week`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              periodValue === "this_week"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {t("filters.thisWeek")}
          </Link>
          <Link
            href={`/${locale}/time?period=last_week`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              periodValue === "last_week"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {t("filters.lastWeek")}
          </Link>
          <Link
            href={`/${locale}/time?period=this_month`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              periodValue === "this_month"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {t("filters.thisMonth")}
          </Link>
          <Link
            href={`/${locale}/time?period=all`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              periodValue === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {t("filters.all")}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("myTimes.totalForPeriod")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{formatMinutes(totalMinutes, labels)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("myTimes.byProject")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {byProject.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("myTimes.empty")}</p>
          ) : (
            byProject.map((item) => (
              <div key={item.projectId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.projectName}</span>
                <span className="font-medium">{formatMinutes(item.totalMinutes, labels)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("myTimes.entries")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("myTimes.empty")}</p>
          ) : (
            filteredEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{entry.taskTitle ?? t("list.noTask")}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatMinutes(entry.minutes, labels)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{entry.projectName}</p>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  }).format(new Date(entry.date))}
                </p>
                {entry.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
