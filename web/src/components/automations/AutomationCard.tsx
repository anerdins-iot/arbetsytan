"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Pencil, Trash2, History, Zap } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  pauseAutomation,
  resumeAutomation,
  deleteAutomation,
  type AutomationItem,
} from "@/actions/automations";

type AutomationCardProps = {
  automation: AutomationItem;
  onUpdate: () => void;
  onEdit: (automation: AutomationItem) => void;
  onOpenHistory: (automation: AutomationItem) => void;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  ACTIVE: "default",
  PAUSED: "outline",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export function AutomationCard({
  automation,
  onUpdate,
  onEdit,
  onOpenHistory,
}: AutomationCardProps) {
  const t = useTranslations("automations");
  const [isPending, startTransition] = useTransition();
  const getToolLabel = (toolName: string) => {
    const key = `tools.${toolName}`;
    return t.has(key) ? t(key) : toolName;
  };

  const nextRun = automation.nextRunAt ?? automation.triggerAt;
  const nextRunFormatted = nextRun
    ? new Date(nextRun).toLocaleString("sv-SE", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: automation.timezone ?? "Europe/Stockholm",
      })
    : "—";

  const handlePause = () => {
    startTransition(async () => {
      const result = await pauseAutomation(automation.id);
      if (result.success) onUpdate();
      else alert(result.error);
    });
  };

  const handleResume = () => {
    startTransition(async () => {
      const result = await resumeAutomation(automation.id);
      if (result.success) onUpdate();
      else alert(result.error);
    });
  };

  const handleDelete = () => {
    if (!confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      const result = await deleteAutomation(automation.id);
      if (result.success) onUpdate();
      else alert(result.error);
    });
  };

  const canPauseResume =
    automation.status === "ACTIVE" || automation.status === "PAUSED";
  const statusKey = automation.status as keyof typeof STATUS_VARIANT;
  const badgeVariant = STATUS_VARIANT[automation.status] ?? "secondary";

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">
              {automation.name}
            </h3>
            {automation.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {automation.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariant}>
                {t(`status.${statusKey}`)}
              </Badge>
              {automation.recurrence && (
                <Badge variant="outline" className="gap-1">
                  <Zap className="size-3" />
                  {t("recurring")}
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                disabled={isPending}
              >
                <span className="sr-only">{t("edit")}</span>
                <Pencil className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(automation)}>
                <Pencil className="mr-2 size-4" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenHistory(automation)}>
                <History className="mr-2 size-4" />
                {t("history")}
              </DropdownMenuItem>
              {canPauseResume && (
                <>
                  <DropdownMenuSeparator />
                  {automation.status === "ACTIVE" ? (
                    <DropdownMenuItem onClick={handlePause}>
                      <Pause className="mr-2 size-4" />
                      {t("pause")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleResume}>
                      <Play className="mr-2 size-4" />
                      {t("resume")}
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-3">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t("nextRun")}</span>
            <span className="font-medium">{nextRunFormatted}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t("action")}</span>
            <span className="font-medium">{getToolLabel(automation.actionTool)}</span>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="pt-0 flex flex-wrap gap-2">
        {canPauseResume && (
          automation.status === "ACTIVE" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              disabled={isPending}
            >
              <Pause className="mr-1 size-3" />
              {t("pause")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResume}
              disabled={isPending}
            >
              <Play className="mr-1 size-3" />
              {t("resume")}
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(automation)}
          disabled={isPending}
        >
          <Pencil className="mr-1 size-3" />
          {t("edit")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenHistory(automation)}
          disabled={isPending}
        >
          <History className="mr-1 size-3" />
          {t("history")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1 size-3" />
          {t("delete")}
        </Button>
      </CardFooter>
    </Card>
  );
}
