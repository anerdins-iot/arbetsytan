import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { getNotifications } from "@/actions/notifications";
import { checkSubscriptionAccess } from "@/actions/subscription";
import { DashboardShell } from "./_components/dashboard-shell";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

async function DashboardAuthGuard({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const session = await getSession();
  if (!session) {
    redirect(`/${locale}/login`);
  }
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isBillingPage = pathname.includes("/settings/billing");
  if (!isBillingPage) {
    const hasAccess = await checkSubscriptionAccess();
    if (!hasAccess) {
      redirect(`/${locale}/settings/billing`);
    }
  }
  const { notifications, unreadCount } = await getNotifications({ limit: 20 });
  return (
    <DashboardShell initialNotifications={notifications} initialUnreadCount={unreadCount}>
      {children}
    </DashboardShell>
  );
}

export default async function DashboardLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background" />}>
      <DashboardAuthGuard locale={locale}>{children}</DashboardAuthGuard>
    </Suspense>
  );
}
