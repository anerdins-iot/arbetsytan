import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getQuoteCore } from "@/services/quote-service";
import { QuoteDetailView } from "@/components/quotes/quote-detail";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function QuoteDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { userId, tenantId } = await requireAuth();
  await getTranslations("quotes");

  const quote = await getQuoteCore({ tenantId, userId }, id);
  if (!quote) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <QuoteDetailView
        quote={{
          ...quote,
          createdAt: quote.createdAt.toISOString(),
          updatedAt: quote.updatedAt.toISOString(),
          validUntil: quote.validUntil?.toISOString() ?? null,
          sentAt: quote.sentAt?.toISOString() ?? null,
          acceptedAt: quote.acceptedAt?.toISOString() ?? null,
          rejectedAt: quote.rejectedAt?.toISOString() ?? null,
          items: quote.items.map((i) => ({
            ...i,
            createdAt: i.createdAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
