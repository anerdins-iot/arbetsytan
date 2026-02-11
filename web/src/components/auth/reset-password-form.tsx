"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { resetPassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/routing";

type Props = {
  token: string;
};

export function ResetPasswordForm({ token }: Props) {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    const data = new FormData();
    data.set("token", token);
    data.set("password", String(formData.get("password") ?? ""));

    startTransition(async () => {
      const result = await resetPassword(data);

      if (result.success) {
        setSuccess(true);
        return;
      }

      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        return;
      }

      if (result.error === "INVALID_TOKEN") {
        setError(t("errorInvalidToken"));
        return;
      }

      if (result.error === "EXPIRED_TOKEN") {
        setError(t("errorExpiredToken"));
        return;
      }

      setError(t("errorGeneric"));
    });
  }

  if (success) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-primary/10 p-3 text-sm text-primary">
          {t("resetSuccess")}
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
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={t("newPasswordPlaceholder")}
          required
          minLength={8}
          disabled={isPending}
          aria-invalid={!!fieldErrors.password}
        />
        {fieldErrors.password && (
          <p className="text-sm text-destructive">{fieldErrors.password[0]}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("settingPassword") : t("setNewPassword")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/forgot-password" className="text-primary hover:underline">
          {t("forgotPassword")}
        </Link>
      </p>
    </form>
  );
}
