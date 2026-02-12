"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { acceptInvitationWithRegistration } from "@/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  token: string;
  email: string;
};

export function RegisterAcceptForm({ token, email }: Props) {
  const t = useTranslations("invitations");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    formData.set("token", token);
    formData.set("email", email);

    startTransition(async () => {
      const result = await acceptInvitationWithRegistration(formData);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 1500);
        return;
      }

      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        return;
      }

      if (result.error === "EMAIL_EXISTS") {
        setError(t("errorEmailExists"));
      } else if (result.error === "EXPIRED") {
        setError(t("errorExpired"));
      } else if (result.error === "EMAIL_MISMATCH") {
        setError(t("errorEmailMismatch"));
      } else {
        setError(t("errorGeneric"));
      }
    });
  }

  if (success) {
    return (
      <div className="rounded-md bg-success/10 p-3 text-sm text-success">
        {t("acceptSuccess")}
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
        <Label htmlFor="invite-name">{t("name")}</Label>
        <Input
          id="invite-name"
          name="name"
          type="text"
          placeholder={t("namePlaceholder")}
          required
          disabled={isPending}
          aria-invalid={!!fieldErrors.name}
        />
        {fieldErrors.name && (
          <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t("email")}</Label>
        <Input type="email" value={email} disabled className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-password">{t("password")}</Label>
        <Input
          id="invite-password"
          name="password"
          type="password"
          placeholder={t("passwordPlaceholder")}
          required
          minLength={8}
          disabled={isPending}
          aria-invalid={!!fieldErrors.password}
        />
        {fieldErrors.password && (
          <p className="text-sm text-destructive">
            {fieldErrors.password[0]}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("creatingAccount") : t("createAccountAndAccept")}
      </Button>
    </form>
  );
}
