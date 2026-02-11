import { useTranslations } from "next-intl";
import { UserPlus, FolderPlus, Send } from "lucide-react";

const steps = [
  { key: "step1", icon: UserPlus, step: "1" },
  { key: "step2", icon: FolderPlus, step: "2" },
  { key: "step3", icon: Send, step: "3" },
] as const;

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

  return (
    <section id="how-it-works" className="bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {steps.map(({ key, icon: Icon, step }) => (
            <div key={key} className="relative flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <span className="text-2xl font-bold">{step}</span>
              </div>
              <div className="mb-2 flex h-10 w-10 items-center justify-center">
                <Icon className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                {t(`${key}.title`)}
              </h3>
              <p className="mt-2 max-w-xs text-muted-foreground">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
