import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { Hammer } from "lucide-react";
import { Link } from "@/i18n/routing";
import { CopyrightYear } from "./copyright-year";

export function Footer() {
  const t = useTranslations("landing.footer");

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Hammer className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-foreground">{t("brand")}</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("tagline")}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("product")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("features")}
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("pricingLink")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("security")}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("company")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("about")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("contact")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("blog")}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("legal")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("privacy")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("terms")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("cookies")}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-8">
          <Suspense>
            <CopyrightYear />
          </Suspense>
        </div>
      </div>
    </footer>
  );
}
