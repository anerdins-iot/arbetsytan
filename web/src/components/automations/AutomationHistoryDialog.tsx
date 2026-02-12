"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AutomationItem, AutomationLogItem } from "@/actions/automations";

type AutomationHistoryDialogProps = {
  automation: AutomationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function AutomationHistoryDialog({
  automation,
  open,
  onOpenChange,
}: AutomationHistoryDialogProps) {
  const t = useTranslations("automations");
  const logs: AutomationLogItem[] = automation?.logs ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("historyTitle")}</DialogTitle>
        </DialogHeader>
        {automation && (
          <p className="text-sm text-muted-foreground">{automation.name}</p>
        )}
        <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("historyEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(log.executedAt).toLocaleString("sv-SE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <span
                      className={
                        log.status === "SUCCESS"
                          ? "text-green-600 dark:text-green-400"
                          : log.status === "FAILED"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {t(`logStatus.${log.status}`)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>
                      {t("logDuration")}: {formatDuration(log.durationMs)}
                    </span>
                  </div>
                  {log.errorMessage && (
                    <p className="mt-2 text-xs text-destructive">
                      {t("logError")}: {log.errorMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
