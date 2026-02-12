import { setRequestLocale, getTranslations } from "next-intl/server";
import { listAutomations } from "@/actions/automations";
import { AutomationsManager } from "@/components/automations";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AutomationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "automations" });

  const result = await listAutomations();
  const automations = result.success ? result.automations : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      <AutomationsManager initialAutomations={automations} />
    </div>
  );
}
