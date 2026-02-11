"use client";

import { useTranslations } from "next-intl";

export function CopyrightYear() {
  const t = useTranslations("landing.footer");
  const year = new Date().getFullYear();

  return (
    <p className="text-center text-sm text-muted-foreground">
      {t("copyright", { year: String(year) })}
    </p>
  );
}
