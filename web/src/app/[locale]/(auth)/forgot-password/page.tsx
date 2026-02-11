import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Link } from "@/i18n/routing";

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
      <ForgotPasswordForm />
    </div>
  );
}
