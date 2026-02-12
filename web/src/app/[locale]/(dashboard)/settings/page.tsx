import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getNotificationPreferences } from "@/actions/notification-preferences";
import { getInvitations } from "@/actions/invitations";
import { requireAuth } from "@/lib/auth";
import {
  getRolePermissions,
  getTenantMembers,
  getTenantSettings,
} from "@/actions/settings";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";
import { MemberManagement } from "@/components/settings/member-management";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { RolePermissionsMatrix } from "@/components/settings/role-permissions-matrix";
import { InviteForm } from "@/components/invitations/invite-form";
import { InvitationList } from "@/components/invitations/invitation-list";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings" });
  const { userId, role } = await requireAuth();
  const isAdmin = role === "ADMIN";
  const preferencesResult = await getNotificationPreferences();
  const [tenant, members, invitations, rolePermissions] = isAdmin
    ? await Promise.all([
        getTenantSettings(),
        getTenantMembers(),
        getInvitations(),
        getRolePermissions(),
      ])
    : [null, [], [], null];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      {preferencesResult.success && preferencesResult.preferences ? (
        <NotificationSettings initialPreferences={preferencesResult.preferences} />
      ) : null}

      {isAdmin && tenant ? (
        <>
          <CompanySettingsForm tenant={tenant} />
          {rolePermissions ? (
            <RolePermissionsMatrix
              permissions={rolePermissions.permissions}
              roles={rolePermissions.roles}
            />
          ) : null}
          <MemberManagement members={members} currentUserId={userId} />
          <div className="space-y-4 rounded-lg border border-border bg-card p-6">
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">
                {t("invitations.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("invitations.description")}
              </p>
            </div>
            <InviteForm />
            <InvitationList invitations={invitations} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-card-foreground">
            {t("adminOnly.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("adminOnly.description")}
          </p>
        </div>
      )}
    </div>
  );
}
