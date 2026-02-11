import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Hammer, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AuthLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });
  const tSidebar = await getTranslations({ locale, namespace: "sidebar" });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="mb-8 flex items-center gap-2">
        <Hammer className="size-8 text-primary" />
        <span className="text-2xl font-bold text-foreground">{tSidebar("brand")}</span>
      </div>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
      <Link
        href="/"
        className="mt-6 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("backToHome")}
      </Link>
    </div>
  );
}
