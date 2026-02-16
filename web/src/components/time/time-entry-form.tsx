"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createTimeEntry } from "@/actions/time-entries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayInputValue } from "./time-utils";

type TaskOption = {
  id: string;
  title: string;
};

type TimeEntryFormProps = {
  tasks: TaskOption[];
  projectId?: string;
  onCreated?: () => void;
};

export function TimeEntryForm({ tasks, projectId, onCreated }: TimeEntryFormProps) {
  const t = useTranslations("time");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [taskId, setTaskId] = useState<string>(tasks[0]?.id ?? "none");
  const [entryType, setEntryType] = useState<string>("WORK");
  const [amount, setAmount] = useState<string>("30");
  const [unit, setUnit] = useState<"minutes" | "hours">("minutes");
  const [date, setDate] = useState<string>(todayInputValue());
  const [description, setDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const computedMinutes = useMemo(() => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (unit === "hours") return Math.round(value * 60);
    return Math.round(value);
  }, [amount, unit]);

  const handleTaskChange = (val: string) => {
    setTaskId(val);
    if (val !== "none") {
      setEntryType("WORK");
    }
  };

  function submit() {
    setError(null);
    if (computedMinutes <= 0 || !date) {
      setError(t("errors.invalidInput"));
      return;
    }

    startTransition(async () => {
      const result = await createTimeEntry({
        taskId: taskId === "none" ? undefined : taskId,
        projectId,
        minutes: computedMinutes,
        date,
        description,
        entryType: entryType as any,
      });

      if (!result.success) {
        setError(t("errors.generic"));
        return;
      }

      setAmount("30");
      setUnit("minutes");
      setDescription("");
      onCreated?.();
      router.refresh();
    });
  }

  const timeTypes = ["WORK", "VACATION", "SICK", "VAB", "PARENTAL", "EDUCATION", "OTHER"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("create.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("fields.task")}</Label>
          <Select value={taskId} onValueChange={handleTaskChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("fields.noTask")}</SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {taskId === "none" && (
          <div className="space-y-2">
            <Label>{t("fields.type")}</Label>
            <Select value={entryType} onValueChange={setEntryType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`fields.types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="time-amount">{t("fields.amount")}</Label>
            <Input
              id="time-amount"
              type="number"
              min="1"
              step={unit === "hours" ? "0.25" : "1"}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("fields.unit")}</Label>
            <Select
              value={unit}
              onValueChange={(value) => setUnit(value as "minutes" | "hours")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">{t("units.minutes")}</SelectItem>
                <SelectItem value="hours">{t("units.hours")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="time-date">{t("fields.date")}</Label>
          <Input
            id="time-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time-description">{t("fields.description")}</Label>
          <Textarea
            id="time-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("fields.descriptionPlaceholder")}
            maxLength={500}
            disabled={isPending}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="button" onClick={submit} disabled={isPending} className="w-full">
          {isPending ? t("create.saving") : t("create.submit")}
        </Button>
      </CardContent>
    </Card>
  );
}
