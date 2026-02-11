"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/routing";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await requestPasswordReset(formData);

      if (result.success) {
        setSuccess(true);
        return;
      }

      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        return;
      }

      if (result.error === "EMAIL_NOT_FOUND") {
        setError(t("errorEmailNotFound"));
        return;
      }

      if (result.error === "EMAIL_SEND_FAILED") {
        setError(t("errorEmailSendFailed"));
        return;
      }

      setError(t("errorGeneric"));
    });
  }

  if (success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("forgotPasswordDescription")}
        </p>
        <p className="rounded-md bg-primary/10 p-3 text-sm text-primary">
          {t("resetLinkSentMessage")}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          required
          disabled={isPending}
          aria-invalid={!!fieldErrors.email}
        />
        {fieldErrors.email && (
          <p className="text-sm text-destructive">{fieldErrors.email[0]}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("sendingResetLink") : t("sendResetLink")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
