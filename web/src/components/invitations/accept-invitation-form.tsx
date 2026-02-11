"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/actions/invitations";
import { Button } from "@/components/ui/button";

type Props = {
  token: string;
};

export function AcceptInvitationForm({ token }: Props) {
  const t = useTranslations("invitations");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("token", token);

    startTransition(async () => {
      const result = await acceptInvitation(formData);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 1500);
        return;
      }

      if (result.error === "EMAIL_MISMATCH") {
        setError(t("errorEmailMismatch"));
      } else if (result.error === "EXPIRED") {
        setError(t("errorExpired"));
      } else if (result.error === "ALREADY_ACCEPTED") {
        setError(t("errorAlreadyAccepted"));
      } else {
        setError(t("errorGeneric"));
      }
    });
  }

  if (success) {
    return (
      <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
        {t("acceptSuccess")}
      </div>
    );
  }

  return (
    <form action={handleSubmit}>
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("acceptingButton") : t("acceptButton")}
      </Button>
    </form>
  );
}
