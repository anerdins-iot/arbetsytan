import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/routing";

const plans = ["starter", "professional", "enterprise"] as const;

export function PricingSection() {
  const t = useTranslations("landing.pricing");

  return (
    <section id="pricing" className="bg-secondary/30 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {plans.map((plan) => {
            const isPopular = plan === "professional";
            const features = t.raw(`${plan}.features`) as string[];

            return (
              <Card
                key={plan}
                className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg" : "border-border"}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    {t("popular")}
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{t(`${plan}.name`)}</CardTitle>
                  <CardDescription>{t(`${plan}.description`)}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {t(`${plan}.price`)}
                    </span>
                    {plan !== "enterprise" && (
                      <span className="text-muted-foreground">
                        {t("monthly")} {t("perUser")}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {features.map((feature: string) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/">
                      {isPopular ? t("ctaPopular") : t("cta")}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("trial")}
        </p>
      </div>
    </section>
  );
}
