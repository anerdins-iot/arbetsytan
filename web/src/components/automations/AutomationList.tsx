"use client";

import { useTranslations } from "next-intl";
import { AutomationCard } from "./AutomationCard";
import type { AutomationItem } from "@/actions/automations";

type AutomationListProps = {
  automations: AutomationItem[];
  onUpdate: () => void;
  onEdit: (automation: AutomationItem) => void;
  onOpenHistory: (automation: AutomationItem) => void;
};

const ACTIVE_STATUSES = ["ACTIVE", "PENDING"];
const PAUSED_STATUS = "PAUSED";
const END_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];

function groupAutomations(automations: AutomationItem[]) {
  const active: AutomationItem[] = [];
  const paused: AutomationItem[] = [];
  const ended: AutomationItem[] = [];

  for (const a of automations) {
    if (ACTIVE_STATUSES.includes(a.status)) active.push(a);
    else if (a.status === PAUSED_STATUS) paused.push(a);
    else if (END_STATUSES.includes(a.status)) ended.push(a);
  }

  return { active, paused, ended };
}

export function AutomationList({
  automations,
  onUpdate,
  onEdit,
  onOpenHistory,
}: AutomationListProps) {
  const t = useTranslations("automations");

  if (automations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
        <p className="font-medium text-foreground">{t("empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>
      </div>
    );
  }

  const { active, paused, ended } = groupAutomations(automations);

  const renderGroup = (items: AutomationItem[], key: string) => (
    <div key={key} className="space-y-3">
      {items.map((automation) => (
        <AutomationCard
          key={automation.id}
          automation={automation}
          onUpdate={onUpdate}
          onEdit={onEdit}
          onOpenHistory={onOpenHistory}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {active.length > 0 && renderGroup(active, "active")}
      {paused.length > 0 && renderGroup(paused, "paused")}
      {ended.length > 0 && renderGroup(ended, "ended")}
    </div>
  );
}
