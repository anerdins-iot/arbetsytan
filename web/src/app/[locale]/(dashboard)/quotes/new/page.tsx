import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { getProjectsCore } from "@/services/project-service";
import { getQuoteSuggestionsCore } from "@/services/quote-service";
import { QuoteForm } from "@/components/quotes/quote-form";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function NewQuotePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, tenantId } = await requireAuth();
  const t = await getTranslations("quotes");

  const [projects, suggestions] = await Promise.all([
    getProjectsCore({ tenantId, userId }, { includeTaskCount: false }),
    getQuoteSuggestionsCore({ tenantId, userId }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">{t("newQuote")}</h1>
      <QuoteForm
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        suggestions={suggestions}
      />
    </div>
  );
}
