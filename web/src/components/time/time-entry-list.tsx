"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  deleteTimeEntry,
  updateTimeEntry,
  type GroupedTimeEntries,
} from "@/actions/time-entries";
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
import { formatDateKey, formatMinutes, toInputDate } from "./time-utils";

type TaskOption = {
  id: string;
  title: string;
};

type TimeEntryListProps = {
  groupedEntries: GroupedTimeEntries[];
  tasks: TaskOption[];
};

type EditState = {
  id: string;
  taskId: string;
  projectId: string | null;
  minutes: string;
  date: string;
  description: string;
  entryType: string;
};

export function TimeEntryList({ groupedEntries, tasks }: TimeEntryListProps) {
  const t = useTranslations("time");
  const locale = useLocale();
  const router = useRouter();
  const labels = { hour: t("units.shortHours"), minute: t("units.shortMinutes") };
  const [isPending, startTransition] = useTransition();
  const [editState, setEditState] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(entry: GroupedTimeEntries["entries"][number]) {
    setError(null);
    setEditState({
      id: entry.id,
      taskId: entry.taskId ?? "none",
      projectId: entry.projectId,
      minutes: String(entry.minutes),
      date: toInputDate(entry.date),
      description: entry.description ?? "",
      entryType: entry.entryType,
    });
  }

  function saveEdit() {
    if (!editState) return;
    setError(null);
    const parsedMinutes = Number(editState.minutes);
    if (
      !Number.isFinite(parsedMinutes) ||
      parsedMinutes <= 0
    ) {
      setError(t("errors.invalidInput"));
      return;
    }

    startTransition(async () => {
      const result = await updateTimeEntry(editState.id, {
        taskId: editState.taskId === "none" ? null : editState.taskId,
        projectId: editState.projectId ?? undefined,
        minutes: Math.round(parsedMinutes),
        date: editState.date,
        description: editState.description,
        entryType: editState.entryType as any,
      });

      if (!result.success) {
        setError(t("errors.generic"));
        return;
      }

      setEditState(null);
      router.refresh();
    });
  }

  const timeTypes = ["WORK", "VACATION", "SICK", "VAB", "PARENTAL", "EDUCATION", "OTHER"];

  function removeEntry(id: string) {
    const confirmed = window.confirm(t("list.deleteConfirm"));
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteTimeEntry(id);
      if (!result.success) {
        setError(t("errors.generic"));
        return;
      }
      router.refresh();
    });
  }

  if (groupedEntries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {groupedEntries.map((group) => (
        <Card key={group.date}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{formatDateKey(group.date, locale)}</span>
              <span className="text-sm font-medium text-muted-foreground">
                {t("list.dayTotal", { total: formatMinutes(group.totalMinutes, labels) })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.entries.map((entry) => {
              const isEditing = editState?.id === entry.id;
              return (
                <div key={entry.id} className="rounded-md border border-border p-3">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t("fields.task")}</Label>
                          <Select
                            value={editState.taskId}
                            onValueChange={(value) =>
                              setEditState((current) =>
                                current ? { ...current, taskId: value, entryType: value !== "none" ? "WORK" : current.entryType } : current
                              )
                            }
                          >
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
                        <div className="space-y-2">
                          <Label>{t("fields.amount")}</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={editState.minutes}
                            onChange={(event) =>
                              setEditState((current) =>
                                current ? { ...current, minutes: event.target.value } : current
                              )
                            }
                            disabled={isPending}
                          />
                        </div>
                      </div>

                      {editState.taskId === "none" && (
                        <div className="space-y-2">
                          <Label>{t("fields.type")}</Label>
                          <Select
                            value={editState.entryType}
                            onValueChange={(value) =>
                              setEditState((current) =>
                                current ? { ...current, entryType: value } : current
                              )
                            }
                          >
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

                      <div className="space-y-2">
                        <Label>{t("fields.date")}</Label>
                        <Input
                          type="date"
                          value={editState.date}
                          onChange={(event) =>
                            setEditState((current) =>
                              current ? { ...current, date: event.target.value } : current
                            )
                          }
                          disabled={isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("fields.description")}</Label>
                        <Textarea
                          value={editState.description}
                          onChange={(event) =>
                            setEditState((current) =>
                              current ? { ...current, description: event.target.value } : current
                            )
                          }
                          maxLength={500}
                          disabled={isPending}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" onClick={saveEdit} disabled={isPending}>
                          {t("list.save")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditState(null)}
                          disabled={isPending}
                        >
                          {t("list.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {entry.taskTitle ?? t("list.noTask")}
                          {entry.entryType !== "WORK" && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground italic">
                              ({t(`fields.types.${entry.entryType}`)})
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatMinutes(entry.minutes, labels)}
                        </p>
                        {entry.description ? (
                          <p className="text-sm text-muted-foreground">{entry.description}</p>
                        ) : null}
                        {!entry.isMine ? (
                          <p className="text-xs text-muted-foreground">{t("list.otherUserEntry")}</p>
                        ) : null}
                      </div>
                      {entry.isMine ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(entry)}
                            disabled={isPending}
                          >
                            {t("list.edit")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => removeEntry(entry.id)}
                            disabled={isPending}
                          >
                            {t("list.delete")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
