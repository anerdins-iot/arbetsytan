"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trash2, Check, X, Loader2 } from "lucide-react";

export type DeleteConfirmationItem = {
  id: string;
  label: string;
};

export type DeleteConfirmationData = {
  type:
    | "file"
    | "task"
    | "comment"
    | "projectNote"
    | "personalNote"
    | "personalFile"
    | "timeEntry"
    | "automation"
    | "noteCategory";
  items: DeleteConfirmationItem[];
  /** Params to pass to the delete Server Action when user confirms */
  actionParams: Record<string, string>;
};

type Props = {
  data: DeleteConfirmationData;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
  onCancel?: () => void;
};

export function DeleteConfirmationCard({ data, onConfirm, onCancel }: Props) {
  const t = useTranslations("deleteConfirmation");
  const [status, setStatus] = useState<"pending" | "deleting" | "deleted" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setStatus("deleting");
    setError(null);

    try {
      const result = await onConfirm();
      if (result.success) {
        setStatus("deleted");
      } else {
        setStatus("error");
        setError(result.error ?? t("errorGeneric"));
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    }
  };

  const typeLabel = t(`type.${data.type}`);

  return (
    <Card className="w-full max-w-md border-destructive/30 bg-card">
      <CardHeader className="pb-1.5 pt-3 px-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-destructive/10 p-1.5">
            <Trash2 className="size-3.5 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm">{t("title")}</CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              {t("description", { type: typeLabel })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-2 px-3">
        <ul className="rounded bg-muted/50 px-2.5 py-1.5 space-y-0.5">
          {data.items.map((item) => (
            <li key={item.id} className="text-xs font-medium truncate">
              {item.label}
            </li>
          ))}
        </ul>

        {status === "deleted" && (
          <div className="flex items-center gap-1.5 rounded bg-success/10 px-2 py-1.5 text-success">
            <Check className="size-3.5 shrink-0" />
            <span className="text-xs font-medium">{t("deleted")}</span>
          </div>
        )}

        {status === "error" && error && (
          <div className="flex items-center gap-1.5 rounded bg-destructive/10 px-2 py-1.5 text-destructive">
            <X className="size-3.5 shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-1.5 pt-0 px-3 pb-2">
        {status === "pending" && (
          <>
            {onCancel && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
                {t("cancel")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto gap-1.5 h-8 text-xs"
              onClick={handleConfirm}
            >
              <Trash2 className="size-3.5" />
              {t("confirm")}
            </Button>
          </>
        )}

        {status === "deleting" && (
          <Button size="sm" disabled className="ml-auto gap-1.5 h-8 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            {t("deleting")}
          </Button>
        )}

        {status === "error" && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 text-xs"
            onClick={() => setStatus("pending")}
          >
            {t("retry")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
