import { useTranslations } from "next-intl";
import { Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

export function Header() {
  const t = useTranslations("landing.header");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Hammer className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">{t("brand")}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">{t("login")}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/">{t("getStarted")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
