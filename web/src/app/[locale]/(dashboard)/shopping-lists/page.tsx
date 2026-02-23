import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { getShoppingListsCore } from "@/services/shopping-list-service";
import { ShoppingListsClient } from "./shopping-lists-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ShoppingListsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, tenantId } = await requireAuth();
  const t = await getTranslations("shoppingList");

  const lists = await getShoppingListsCore({ tenantId, userId });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      </div>
      <ShoppingListsClient
        initialLists={lists.map((l) => ({
          ...l,
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
