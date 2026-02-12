"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { updateTenant, type TenantSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CompanySettingsFormProps = {
  tenant: TenantSettings;
};

export function CompanySettingsForm({ tenant }: CompanySettingsFormProps) {
  const t = useTranslations("settings.company");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateTenant(formData);
      if (result.success) {
        setSuccess(true);
        router.refresh();
        return;
      }

      if (result.error === "INVALID_INPUT") {
        setError(t("errors.invalidInput"));
        return;
      }

      setError(t("errors.generic"));
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      <form action={handleSubmit} className="mt-4 space-y-4">
        {error ? (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
            {t("saved")}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="tenant-name">{t("name")}</Label>
          <Input
            id="tenant-name"
            name="name"
            defaultValue={tenant.name}
            required
            maxLength={120}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenant-org-number">{t("orgNumber")}</Label>
          <Input
            id="tenant-org-number"
            name="orgNumber"
            defaultValue={tenant.orgNumber ?? ""}
            maxLength={50}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenant-address">{t("address")}</Label>
          <Textarea
            id="tenant-address"
            name="address"
            defaultValue={tenant.address ?? ""}
            maxLength={500}
            disabled={isPending}
          />
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </form>
    </div>
  );
}
