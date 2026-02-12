"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAutomation, updateAutomation, type AutomationItem } from "@/actions/automations";
import {
  getSchedulableTools,
  getToolDefinition,
  type ToolParameter,
} from "@/lib/ai/tool-definitions";

type CreateAutomationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: string;
  automation?: AutomationItem | null;
};

type RecurrenceType = "once" | "daily" | "weekly";
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon–Sun for display; cron: 0=Sun, 1=Mon

function buildRecurrence(
  type: RecurrenceType,
  date: Date,
  weekday: number
): string | null {
  if (type === "once") return null;
  const min = date.getMinutes();
  const hour = date.getHours();
  const cronMin = min;
  const cronHour = hour;
  if (type === "daily") {
    return `${cronMin} ${cronHour} * * *`;
  }
  // weekly: cron dow 0=Sunday, 1=Monday
  return `${cronMin} ${cronHour} * * ${weekday}`;
}

function getDefaultTriggerAtInput() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function formatDateForInput(value: string) {
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

/** YYYY-MM-DD from triggerAt (YYYY-MM-DDTHH:mm) */
function getDatePart(triggerAt: string) {
  return triggerAt.slice(0, 10);
}

/** Hour in 24h (0–23) from triggerAt */
function getHour24(triggerAt: string) {
  return parseInt(triggerAt.slice(11, 13), 10) || 0;
}

/** Minute (0–59) from triggerAt */
function getMinute(triggerAt: string) {
  return parseInt(triggerAt.slice(14, 16), 10) || 0;
}

/** Build triggerAt from date (YYYY-MM-DD) and 24h hour/minute */
function buildTriggerAt(datePart: string, hour24: number, minute: number) {
  const h = String(hour24).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  return `${datePart}T${h}:${m}`;
}

function parseRecurrence(
  recurrence: string | null
): { recurrenceType: RecurrenceType; weekday: number } {
  if (!recurrence) {
    return { recurrenceType: "once", weekday: 1 };
  }

  const parts = recurrence.trim().split(/\s+/);
  if (parts.length === 5 && parts[2] === "*" && parts[3] === "*") {
    if (parts[4] === "*") {
      return { recurrenceType: "daily", weekday: 1 };
    }
    const parsedWeekday = Number(parts[4]);
    return {
      recurrenceType: "weekly",
      weekday: Number.isNaN(parsedWeekday) ? 1 : parsedWeekday,
    };
  }

  return { recurrenceType: "once", weekday: 1 };
}

function ActionParamsFields({
  toolName,
  value,
  onChange,
  projectId,
  disabled,
}: {
  toolName: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  projectId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("automations");
  const def = getToolDefinition(toolName);
  const fields = useMemo(() => {
    if (!def) return [];
    return def.parameters.filter((p) => p.name !== "projectId" || !projectId);
  }, [def, projectId]);

  const update = (name: string, val: string | number | boolean) => {
    onChange({ ...value, [name]: val });
  };

  const getParamLabel = (param: ToolParameter) => {
    const key = `toolParams.${param.name}`;
    return t.has(key) ? t(key) : param.description;
  };

  const getParamPlaceholder = (param: ToolParameter) => {
    const key = `toolParams.${param.name}Placeholder`;
    if (t.has(key)) return t(key);
    return getParamLabel(param);
  };

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      <Label>{t("actionParams")}</Label>
      {fields.map((param) => {
        const key = param.name;
        const current = value[key];
        const strVal =
          typeof current === "string"
            ? current
            : typeof current === "number"
              ? String(current)
              : typeof current === "boolean"
                ? current
                  ? "true"
                  : "false"
                : "";

        if (param.type === "enum" && param.enumValues) {
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={key} className="text-xs">
                {getParamLabel(param)}
              </Label>
              <Select
                value={strVal || undefined}
                onValueChange={(v) => update(key, v)}
                disabled={disabled}
              >
                <SelectTrigger id={key}>
                  <SelectValue placeholder={getParamPlaceholder(param)} />
                </SelectTrigger>
                <SelectContent>
                  {param.enumValues.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (param.type === "boolean") {
          return (
            <div key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={key}
                checked={current === true || strVal === "true"}
                onChange={(e) => update(key, e.target.checked)}
                disabled={disabled}
                className="rounded border-input"
              />
              <Label htmlFor={key} className="text-xs">
                {getParamLabel(param)}
              </Label>
            </div>
          );
        }

        const inputType =
          param.type === "number"
            ? "number"
            : param.type === "date"
              ? "date"
              : "text";

        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={key} className="text-xs">
              {getParamLabel(param)}
              {param.required && " *"}
            </Label>
            <Input
              id={key}
              type={inputType}
              value={strVal}
              onChange={(e) =>
                update(
                  key,
                  inputType === "number" ? Number(e.target.value) : e.target.value
                )
              }
              required={param.required}
              disabled={disabled}
              placeholder={getParamPlaceholder(param)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** 24h hour to 12h + AM/PM for en locale */
function hour24To12(hour24: number): { hour12: number; ampm: "AM" | "PM" } {
  if (hour24 === 0) return { hour12: 12, ampm: "AM" };
  if (hour24 < 12) return { hour12: hour24, ampm: "AM" };
  if (hour24 === 12) return { hour12: 12, ampm: "PM" };
  return { hour12: hour24 - 12, ampm: "PM" };
}

function hour12To24(hour12: number, ampm: "AM" | "PM"): number {
  if (ampm === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function CreateAutomationDialog({
  open,
  onOpenChange,
  onSuccess,
  projectId,
  automation,
}: CreateAutomationDialogProps) {
  const t = useTranslations("automations");
  const locale = useLocale() as string;
  const isSv = locale === "sv";
  const defaultTriggerAt = useMemo(() => getDefaultTriggerAtInput(), []);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerAt, setTriggerAt] = useState(defaultTriggerAt);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("once");
  const [weekday, setWeekday] = useState<number>(1);
  const [actionTool, setActionTool] = useState("");
  const [actionParams, setActionParams] = useState<Record<string, unknown>>({});
  const [isPending, startTransition] = useTransition();

  const schedulableTools = useMemo(() => getSchedulableTools(), []);
  const getToolLabel = (toolName: string) => {
    const key = `tools.${toolName}`;
    return t.has(key) ? t(key) : toolName;
  };

  useEffect(() => {
    if (!open) return;

    if (automation) {
      const { recurrenceType: recurrence, weekday: recurrenceWeekday } =
        parseRecurrence(automation.recurrence);
      setName(automation.name);
      setDescription(automation.description ?? "");
      setTriggerAt(formatDateForInput(automation.triggerAt));
      setRecurrenceType(recurrence);
      setWeekday(recurrenceWeekday);
      setActionTool(automation.actionTool);
      setActionParams((automation.actionParams as Record<string, unknown>) ?? {});
      return;
    }

    setName("");
    setDescription("");
    setTriggerAt(defaultTriggerAt);
    setRecurrenceType("once");
    setWeekday(1);
    setActionTool("");
    setActionParams({});
  }, [automation, defaultTriggerAt, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert(t("nameRequired"));
      return;
    }
    if (!actionTool) {
      alert(t("actionToolPlaceholder"));
      return;
    }

    const triggerDate = triggerAt ? new Date(triggerAt) : new Date();
    const recurrence = buildRecurrence(recurrenceType, triggerDate, weekday);

    const paramsWithProject =
      projectId ? { ...actionParams, projectId } : actionParams;

    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerAt: triggerDate,
        recurrence: recurrence ?? undefined,
        timezone: "Europe/Stockholm",
        actionTool,
        actionParams: paramsWithProject as Record<string, unknown>,
      };
      const result = automation
        ? await updateAutomation(automation.id, payload)
        : await createAutomation({
            ...payload,
            projectId,
          });

      if (result.success) {
        setName("");
        setDescription("");
        setTriggerAt(defaultTriggerAt);
        setRecurrenceType("once");
        setWeekday(1);
        setActionTool("");
        setActionParams({});
        onOpenChange(false);
        onSuccess();
      } else {
        alert(result.error);
      }
    });
  };

  const handleCancel = () => {
    setName("");
    setDescription("");
    setTriggerAt(defaultTriggerAt);
    setRecurrenceType("once");
    setWeekday(1);
    setActionTool("");
    setActionParams({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{automation ? t("edit") : t("create")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("name")} *</Label>
              <Input
                id="name"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("descriptionLabel")}</Label>
              <Textarea
                id="description"
                placeholder={t("descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={1000}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("dateTime")}</Label>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="triggerDate" className="sr-only">
                    {t("dateTime")}
                  </Label>
                  <Input
                    id="triggerDate"
                    type="date"
                    value={getDatePart(triggerAt)}
                    onChange={(e) =>
                      setTriggerAt(
                        buildTriggerAt(
                          e.target.value,
                          getHour24(triggerAt),
                          getMinute(triggerAt)
                        )
                      )
                    }
                    required
                    disabled={isPending}
                  />
                </div>
                {isSv ? (
                  <>
                    <Select
                      value={String(getHour24(triggerAt))}
                      onValueChange={(v) =>
                        setTriggerAt(
                          buildTriggerAt(
                            getDatePart(triggerAt),
                            Number(v),
                            getMinute(triggerAt)
                          )
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[72px]" aria-label={t("hour")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {String(i).padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground pb-2">:</span>
                    <Select
                      value={String(getMinute(triggerAt))}
                      onValueChange={(v) =>
                        setTriggerAt(
                          buildTriggerAt(
                            getDatePart(triggerAt),
                            getHour24(triggerAt),
                            Number(v)
                          )
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[72px]" aria-label={t("minute")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 60 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {String(i).padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Select
                      value={String(hour24To12(getHour24(triggerAt)).hour12)}
                      onValueChange={(v) =>
                        setTriggerAt(
                          buildTriggerAt(
                            getDatePart(triggerAt),
                            hour12To24(
                              Number(v),
                              hour24To12(getHour24(triggerAt)).ampm
                            ),
                            getMinute(triggerAt)
                          )
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[64px]" aria-label={t("hour")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i} value={String(i + 1)}>
                            {i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground pb-2">:</span>
                    <Select
                      value={String(getMinute(triggerAt))}
                      onValueChange={(v) =>
                        setTriggerAt(
                          buildTriggerAt(
                            getDatePart(triggerAt),
                            getHour24(triggerAt),
                            Number(v)
                          )
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[72px]" aria-label={t("minute")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 60 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {String(i).padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={hour24To12(getHour24(triggerAt)).ampm}
                      onValueChange={(v) =>
                        setTriggerAt(
                          buildTriggerAt(
                            getDatePart(triggerAt),
                            hour12To24(
                              hour24To12(getHour24(triggerAt)).hour12,
                              v as "AM" | "PM"
                            ),
                            getMinute(triggerAt)
                          )
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[72px]" aria-label="AM/PM">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("schedule")}</Label>
              <Select
                value={recurrenceType}
                onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{t("scheduleOnce")}</SelectItem>
                  <SelectItem value="daily">{t("scheduleDaily")}</SelectItem>
                  <SelectItem value="weekly">{t("scheduleWeekly")}</SelectItem>
                </SelectContent>
              </Select>
              {recurrenceType === "weekly" && (
                <Select
                  value={String(weekday)}
                  onValueChange={(v) => setWeekday(Number(v))}
                  disabled={isPending}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={t("weekday")} />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {new Date(2000, 0, 2 + d).toLocaleDateString("sv-SE", {
                          weekday: "long",
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionTool">{t("action")} *</Label>
              <Select
                value={actionTool}
                onValueChange={(v) => {
                  setActionTool(v);
                  setActionParams({});
                }}
                disabled={isPending}
              >
                <SelectTrigger id="actionTool">
                  <SelectValue placeholder={t("actionToolPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {schedulableTools.map((tool) => (
                    <SelectItem key={tool.name} value={tool.name}>
                      {getToolLabel(tool.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {actionTool && (
              <ActionParamsFields
                toolName={actionTool}
                value={actionParams}
                onChange={setActionParams}
                projectId={projectId}
                disabled={isPending}
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("creating") : automation ? t("edit") : t("createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
