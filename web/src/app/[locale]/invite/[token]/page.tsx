import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Hammer, ArrowLeft } from "lucide-react";
import { getInvitationInfo } from "@/actions/invitations";
import { AcceptInvitationForm } from "@/components/invitations/accept-invitation-form";
import { RegisterAcceptForm } from "@/components/invitations/register-accept-form";
import { Link } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

function roleName(role: string, t: Awaited<ReturnType<typeof getTranslations<"invitations">>>) {
  switch (role) {
    case "ADMIN":
      return t("roleAdmin");
    case "PROJECT_MANAGER":
      return t("roleProjectManager");
    case "WORKER":
      return t("roleWorker");
    default:
      return role;
  }
}

async function InvitePageContent({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "invitations" });
  const tSidebar = await getTranslations({ locale, namespace: "sidebar" });
  const tAuth = await getTranslations({ locale, namespace: "auth" });

  const info = await getInvitationInfo(token);

  let content: React.ReactNode;

  if (!info) {
    content = (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-card-foreground">
          {t("errorInvalidToken")}
        </h1>
      </div>
    );
  } else if (info.alreadyAccepted) {
    content = (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-card-foreground">
          {t("acceptTitle", { tenantName: info.tenantName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("errorAlreadyAccepted")}
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t("loginLink")}
        </Link>
      </div>
    );
  } else if (info.expired) {
    content = (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-card-foreground">
          {t("acceptTitle", { tenantName: info.tenantName })}
        </h1>
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t("errorExpired")}
        </p>
      </div>
    );
  } else {
    const roleLabel = roleName(info.role, t);
    const description = info.inviterName
      ? t("acceptDescription", {
          inviterName: info.inviterName,
          tenantName: info.tenantName,
          role: roleLabel,
        })
      : t("acceptDescriptionNoInviter", {
          tenantName: info.tenantName,
          role: roleLabel,
        });

    if (info.currentUserMatch) {
      content = (
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold text-card-foreground">
              {t("acceptTitle", { tenantName: info.tenantName })}
            </h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <AcceptInvitationForm token={token} />
        </div>
      );
    } else if (info.existingUser) {
      content = (
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold text-card-foreground">
              {t("acceptTitle", { tenantName: info.tenantName })}
            </h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              {t("loginToAccept")}
            </p>
            <Link
              href={`/login?callbackUrl=/${locale}/invite/${token}`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90"
            >
              {t("loginLink")}
            </Link>
          </div>
        </div>
      );
    } else {
      content = (
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold text-card-foreground">
              {t("acceptTitle", { tenantName: info.tenantName })}
            </h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            <p className="text-sm text-muted-foreground">
              {t("registerToAccept")}
            </p>
          </div>
          <RegisterAcceptForm token={token} email={info.email} />
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="mb-8 flex items-center gap-2">
        <Hammer className="size-8 text-primary" />
        <span className="text-2xl font-bold text-foreground">{tSidebar("brand")}</span>
      </div>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        {content}
      </div>
      <Link
        href="/"
        className="mt-6 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tAuth("backToHome")}
      </Link>
    </div>
  );
}

export default async function InvitePage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
          <div className="mb-8 flex items-center gap-2">
            <Hammer className="size-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ArbetsYtan</span>
          </div>
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="mx-auto h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="mx-auto h-4 w-64 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <InvitePageContent {...props} />
    </Suspense>
  );
}
