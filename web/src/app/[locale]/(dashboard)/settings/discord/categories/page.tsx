import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getDiscordCategories } from "@/actions/discord";
import { CategoryManager } from "@/components/discord/CategoryManager";
import { Link } from "@/i18n/routing";
import { ArrowLeft } from "lucide-react";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DiscordCategoriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings.discord" });

  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect(`/${locale}/settings`);
  }

  const categories = await getDiscordCategories();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/discord"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToDiscord")}
        </Link>
        <h1 className="text-3xl font-bold text-foreground">
          {t("categories.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t("categories.pageDescription")}
        </p>
      </div>

      <CategoryManager categories={categories} />
    </div>
  );
}
