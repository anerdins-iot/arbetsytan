import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUserProfile } from "@/actions/profile";
import { getUserNotificationPreferences } from "@/actions/notifications";
import { ProfileSettings } from "@/components/settings/profile-settings";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ProfileSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings.profile" });

  const [profile, preferenceResult] = await Promise.all([
    getCurrentUserProfile(),
    getUserNotificationPreferences(),
  ]);

  if (!preferenceResult.success || !preferenceResult.preferences) {
    throw new Error("NOTIFICATION_PREFERENCES_LOAD_FAILED");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>

      <ProfileSettings
        initialProfile={profile}
        initialNotificationPreferences={preferenceResult.preferences}
      />
    </div>
  );
}
