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
    <Card className="w-full max-w-lg border-destructive/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-destructive/10 p-2">
            <Trash2 className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription className="text-xs">
              {t("description", { type: typeLabel })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{typeLabel}</p>
          <ul className="rounded-md bg-muted/50 p-3 space-y-1">
            {data.items.map((item) => (
              <li key={item.id} className="text-sm font-medium truncate">
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        {status === "deleted" && (
          <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-success">
            <Check className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{t("deleted")}</span>
          </div>
        )}

        {status === "error" && error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
            <X className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        {status === "pending" && (
          <>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {t("cancel")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto gap-2"
              onClick={handleConfirm}
            >
              <Trash2 className="h-4 w-4" />
              {t("confirm")}
            </Button>
          </>
        )}

        {status === "deleting" && (
          <Button size="sm" disabled className="ml-auto gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("deleting")}
          </Button>
        )}

        {status === "error" && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setStatus("pending")}
          >
            {t("retry")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
