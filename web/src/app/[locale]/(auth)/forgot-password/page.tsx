import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-card-foreground">
          {t("forgotPasswordTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("forgotPasswordDescription")}
        </p>
      </div>
      <Suspense fallback={<div className="h-[280px] animate-pulse rounded-md bg-muted" />}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
