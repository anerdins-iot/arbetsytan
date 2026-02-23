import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getProjectsWithMembersForEmail } from "@/actions/send-email";
import { getConversations, getEmailUnreadCount } from "@/actions/email-conversations";
import { EmailInboxView } from "@/components/email/email-inbox-view";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function EmailPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "email" });

  const [projectsWithMembers, inboxRes, sentRes, unreadRes] = await Promise.all([
    getProjectsWithMembersForEmail(),
    getConversations({ outboundOnly: false }),
    getConversations({ outboundOnly: true }),
    getEmailUnreadCount(),
  ]);
  const projects = projectsWithMembers.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[calc(100vh-8rem)] text-muted-foreground text-sm">
            {t("inbox.loading")}
          </div>
        }
      >
        <EmailInboxView
          projects={projects}
          inboxConversations={inboxRes.conversations}
          sentConversations={sentRes.conversations}
          unreadCount={unreadRes.unreadCount}
        />
      </Suspense>
    </div>
  );
}
