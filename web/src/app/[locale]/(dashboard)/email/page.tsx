import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getProjectsWithMembersForEmail } from "@/actions/send-email";
import { getConversations } from "@/actions/email-conversations";
import { EmailInboxView } from "@/components/email/email-inbox-view";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function EmailPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "email" });

  const [projectsWithMembers, inboxRes, sentRes] = await Promise.all([
    getProjectsWithMembersForEmail(),
    getConversations({ outboundOnly: false }),
    getConversations({ outboundOnly: true }),
  ]);
  const projects = projectsWithMembers.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      <Suspense fallback={<div className="text-muted-foreground text-sm">{t("inbox.loading")}</div>}>
        <EmailInboxView
          projects={projects}
          inboxConversations={inboxRes.conversations}
          sentConversations={sentRes.conversations}
        />
      </Suspense>
    </div>
  );
}
