import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { getSubscription, getMemberCount } from "@/actions/subscription";
import { Badge } from "@/components/ui/badge";
import { BillingPortalButton } from "@/components/settings/billing-portal-button";

type Props = {
  params: Promise<{ locale: string }>;
};

const PRICE_PER_USER_SEK = 299;

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "TRIALING":
      return "secondary";
    case "PAST_DUE":
      return "destructive";
    case "CANCELED":
      return "destructive";
    default:
      return "outline";
  }
}

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings.billing" });

  await requireRole(["ADMIN"]);

  const [subscription, memberCount] = await Promise.all([
    getSubscription(),
    getMemberCount(),
  ]);

  const totalCost = memberCount * PRICE_PER_USER_SEK;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>

      {subscription?.status === "PAST_DUE" ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            {t("pastDueWarning")}
          </p>
        </div>
      ) : null}

      {subscription?.status === "CANCELED" ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            {t("canceledWarning")}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">
          {t("currentPlan")}
        </h2>

        {subscription ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {t("status")}:
              </span>
              <Badge variant={getStatusVariant(subscription.status)}>
                {t(`statuses.${subscription.status}`)}
              </Badge>
            </div>

            {subscription.status === "TRIALING" &&
            subscription.trialEndsAt ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("trialEnds")}:
                </span>
                <span className="text-sm text-foreground">
                  {new Date(subscription.trialEndsAt).toLocaleDateString(
                    locale,
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </span>
              </div>
            ) : null}

            {subscription.currentPeriodEnd &&
            subscription.status !== "CANCELED" ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("nextInvoice")}:
                </span>
                <span className="text-sm text-foreground">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                    locale,
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </span>
              </div>
            ) : null}

            {subscription.canceledAt ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("canceledAt")}:
                </span>
                <span className="text-sm text-foreground">
                  {new Date(subscription.canceledAt).toLocaleDateString(
                    locale,
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              {t("noSubscription")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noSubscriptionDescription")}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">
          {t("teamSize")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("teamSizeDescription")}
        </p>
        <p className="mt-3 text-2xl font-bold text-foreground">
          {t("activeMembers", { count: memberCount })}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">
          {t("costPerUser")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("costPerUserDescription")}
        </p>
        <div className="mt-3 space-y-1">
          <p className="text-sm text-foreground">
            {t("pricePerUser", { price: PRICE_PER_USER_SEK })}
          </p>
          <p className="text-lg font-semibold text-foreground">
            {t("totalMonthlyCost", { total: totalCost })}
          </p>
        </div>
      </div>

      {subscription ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-card-foreground">
            {t("managePlan")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("managePlanDescription")}
          </p>
          <div className="mt-4">
            <BillingPortalButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
