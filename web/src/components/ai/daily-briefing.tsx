"use client";

import { useTranslations } from "next-intl";
import {
  CalendarClock,
  FolderKanban,
  ListChecks,
  Bell,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DailyBriefing as DailyBriefingData } from "@/actions/briefing";

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("greetingMorning");
  if (hour < 18) return t("greetingAfternoon");
  return t("greetingEvening");
}

type DailyBriefingProps = {
  data: DailyBriefingData;
};

export function DailyBriefing({ data }: DailyBriefingProps) {
  const t = useTranslations("personalAi.briefing");

  const greeting = getGreeting(t);
  const totalTasks = data.myTasks.length;
  const projectCount = data.projectSummary.length;
  const deadlines = data.upcomingDeadlines.slice(0, 3);

  return (
    <Card className="mx-4 mt-4 border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        {/* Greeting */}
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">
            {greeting}
          </h3>
        </div>

        {/* Summary badges */}
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <FolderKanban className="size-3" />
            {t("projects", { count: projectCount })}
          </Badge>
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <ListChecks className="size-3" />
            {t("tasks", { count: totalTasks })}
          </Badge>
          {data.unreadNotifications > 0 && (
            <Badge className="gap-1.5 bg-accent text-accent-foreground text-xs">
              <Bell className="size-3" />
              {t("unread", { count: data.unreadNotifications })}
            </Badge>
          )}
        </div>

        {/* Upcoming deadlines */}
        {deadlines.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("deadlinesTitle")}
            </p>
            <div className="space-y-1">
              {deadlines.map((d, i) => {
                const deadlineDate = new Date(d.deadline);
                const formatted = deadlineDate.toLocaleDateString("sv-SE", {
                  day: "numeric",
                  month: "short",
                });
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <CalendarClock className="size-3 shrink-0 text-accent" />
                    <span className="truncate">{d.title}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {formatted}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
