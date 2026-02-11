import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { getInvitations } from "@/actions/invitations";
import { InviteForm } from "@/components/invitations/invite-form";
import { InvitationList } from "@/components/invitations/invitation-list";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function TeamSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "invitations" });

  // Only ADMIN can access this page
  await requireRole(["ADMIN"]);

  const invitations = await getInvitations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>

      <InviteForm />
      <InvitationList invitations={invitations} />
    </div>
  );
}
