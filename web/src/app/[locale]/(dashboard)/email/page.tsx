import { setRequestLocale, getTranslations } from "next-intl/server";
import { getProjectsWithMembersForEmail, getTeamMembersForEmail } from "@/actions/send-email";
import { EmailComposer } from "@/components/email/email-composer";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function EmailPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "email" });

  const [projects, companyMembersRaw] = await Promise.all([
    getProjectsWithMembersForEmail(),
    getTeamMembersForEmail(),
  ]);

  // Transform company members to match the expected format
  const companyMembers = companyMembersRaw.map((m) => ({
    userId: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      <EmailComposer projects={projects} companyMembers={companyMembers} />
    </div>
  );
}
