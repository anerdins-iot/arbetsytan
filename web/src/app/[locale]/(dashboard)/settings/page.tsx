import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getNotificationPreferences } from "@/actions/notification-preferences";
import { NotificationSettings } from "@/components/settings/notification-settings";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings" });
  const preferencesResult = await getNotificationPreferences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      {preferencesResult.success && preferencesResult.preferences ? (
        <NotificationSettings initialPreferences={preferencesResult.preferences} />
      ) : null}
    </div>
  );
}
