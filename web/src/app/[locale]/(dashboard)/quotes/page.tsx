import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { getQuotesCore } from "@/services/quote-service";
import { QuoteList } from "@/components/quotes/quote-list";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function QuotesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, tenantId } = await requireAuth();
  const t = await getTranslations("quotes");

  const quotes = await getQuotesCore({ tenantId, userId });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <QuoteList
        initialQuotes={quotes.map((q) => ({
          ...q,
          createdAt: q.createdAt.toISOString(),
          updatedAt: q.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
