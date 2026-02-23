import { setRequestLocale, getTranslations } from "next-intl/server";
import { WholesalerSearchUI } from "@/components/wholesaler/wholesaler-search-ui";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SupplierSearchPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("supplierSearch");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <WholesalerSearchUI />
    </div>
  );
}
