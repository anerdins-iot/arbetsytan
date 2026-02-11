"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InviteForm() {
  const t = useTranslations("invitations");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [role, setRole] = useState("WORKER");

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    formData.set("role", role);

    startTransition(async () => {
      const result = await inviteUser(formData);

      if (result.success) {
        setSuccess(true);
        setRole("WORKER");
        router.refresh();
        return;
      }

      if (result.error === "ALREADY_MEMBER") {
        setError(t("errorAlreadyMember"));
      } else if (result.error === "ALREADY_INVITED") {
        setError(t("errorAlreadyInvited"));
      } else if (result.error === "EMAIL_SEND_FAILED") {
        setError(t("errorEmailSendFailed"));
      } else {
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">
        {t("inviteTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("inviteDescription")}
      </p>

      <form action={handleSubmit} className="mt-4 space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            {t("invitationSent")}
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-email">{t("email")}</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              required
              disabled={isPending}
            />
          </div>

          <div className="w-full space-y-2 sm:w-48">
            <Label>{t("role")}</Label>
            <Select value={role} onValueChange={setRole} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">{t("roleAdmin")}</SelectItem>
                <SelectItem value="PROJECT_MANAGER">
                  {t("roleProjectManager")}
                </SelectItem>
                <SelectItem value="WORKER">{t("roleWorker")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? t("sendingInvitation") : t("sendInvitation")}
        </Button>
      </form>
    </div>
  );
}
