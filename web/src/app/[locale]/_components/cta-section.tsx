import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

export function CtaSection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="bg-primary py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 text-lg text-primary-foreground/80">
          {t("description")}
        </p>
        <div className="mt-8">
          <Button size="lg" variant="accent" asChild>
            <Link href="/register">
              {t("button")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
