import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  getDiscordSettings,
  getLinkedUsers,
  getProjectSyncStatus,
  type DiscordSettingsData,
  type LinkedUser,
  type ProjectSyncData,
} from "@/actions/discord";
import { DiscordSetup } from "@/components/discord/DiscordSetup";
import { LinkedUsersTable } from "@/components/discord/LinkedUsersTable";
import { ProjectSyncSection } from "@/components/discord/ProjectSyncSection";
import { Link } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DiscordSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings.discord" });

  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect(`/${locale}/settings`);
  }

  const defaultSettings: DiscordSettingsData = {
    discordGuildId: null,
    discordBotEnabled: false,
    botInviteUrl: null,
  };

  const [settings, linkedUsers, projectSync] = await Promise.all([
    getDiscordSettings().catch((): DiscordSettingsData => defaultSettings),
    getLinkedUsers().catch((): LinkedUser[] => []),
    getProjectSyncStatus().catch((): ProjectSyncData[] => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>

      <DiscordSetup settings={settings} />

      {settings.discordGuildId ? (
        <>
          <LinkedUsersTable users={linkedUsers} />

          <ProjectSyncSection projects={projectSync} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/settings/discord/categories"
              className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-accent"
            >
              <h3 className="text-lg font-semibold text-card-foreground">
                {t("nav.categories")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("nav.categoriesDescription")}
              </p>
            </Link>

            <Link
              href="/settings/discord/roles"
              className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-accent"
            >
              <h3 className="text-lg font-semibold text-card-foreground">
                {t("nav.roles")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("nav.rolesDescription")}
              </p>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
