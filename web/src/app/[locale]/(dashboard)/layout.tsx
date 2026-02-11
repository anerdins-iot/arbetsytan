import { Suspense } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
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
  return <DashboardShell>{children}</DashboardShell>;
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
