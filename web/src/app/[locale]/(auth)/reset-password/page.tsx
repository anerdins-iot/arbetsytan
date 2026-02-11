import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Link } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

async function ResetPasswordContent({ params, searchParams }: Props) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });

  if (!token?.trim()) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-card-foreground">
            {t("resetPasswordTitle")}
          </h1>
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {t("errorInvalidToken")}
          </p>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/forgot-password"
              className="text-primary hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-card-foreground">
          {t("resetPasswordTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("resetPasswordDescription")}
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="h-8 w-48 animate-pulse rounded bg-muted mx-auto" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted mx-auto" />
      </div>
    </div>
  );
}

export default async function ResetPasswordPage(props: Props) {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent {...props} />
    </Suspense>
  );
}
