"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { listAutomations, type AutomationItem } from "@/actions/automations";
import { Button } from "@/components/ui/button";
import { AutomationList } from "./AutomationList";
import { CreateAutomationDialog } from "./CreateAutomationDialog";
import { AutomationHistoryDialog } from "./AutomationHistoryDialog";

type AutomationsManagerProps = {
  initialAutomations: AutomationItem[];
  projectId?: string;
};

export function AutomationsManager({
  initialAutomations,
  projectId,
}: AutomationsManagerProps) {
  const t = useTranslations("automations");
  const [automations, setAutomations] = useState(initialAutomations);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [historyAutomation, setHistoryAutomation] = useState<AutomationItem | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<AutomationItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshAutomations = () => {
    startTransition(async () => {
      const result = await listAutomations(projectId ? { projectId } : undefined);
      if (!result.success) return;
      setAutomations(result.automations);
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setEditingAutomation(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => handleCreateOpenChange(true)} disabled={isPending}>
          <Plus className="mr-2 size-4" />
          {t("create")}
        </Button>
      </div>

      <AutomationList
        automations={automations}
        onUpdate={refreshAutomations}
        onEdit={(automation) => {
          setEditingAutomation(automation);
          setIsCreateOpen(true);
        }}
        onOpenHistory={setHistoryAutomation}
      />

      <CreateAutomationDialog
        open={isCreateOpen}
        onOpenChange={handleCreateOpenChange}
        onSuccess={refreshAutomations}
        projectId={projectId}
        automation={editingAutomation}
      />

      <AutomationHistoryDialog
        automation={historyAutomation}
        open={historyAutomation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryAutomation(null);
          }
        }}
      />
    </div>
  );
}
