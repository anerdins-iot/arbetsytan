"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createBillingPortalSession } from "@/actions/subscription";

export function BillingPortalButton() {
  const t = useTranslations("settings.billing");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await createBillingPortalSession();
        window.location.href = url;
      } catch {
        setError(t("portalError"));
      }
    });
  }

  return (
    <div>
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? t("openingPortal") : t("openPortal")}
      </Button>
      {error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
