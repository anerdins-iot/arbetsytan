/**
 * Wholesaler product search - Elektroskandia and Ahlsell
 *
 * Uses public search APIs to find products from wholesalers.
 * No authentication required for basic search functionality.
 */

// ─── Types ────────────────────────────────────────────────

export interface WholesalerProduct {
  supplier: "ELEKTROSKANDIA" | "AHLSELL";
  articleNo: string;
  name: string;
  description?: string;
  brand?: string;
  price?: number | null;
  unit?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  inStock?: boolean | null;
}

export interface WholesalerSearchResult {
  products: WholesalerProduct[];
  totalCount: number;
  supplier: "ELEKTROSKANDIA" | "AHLSELL";
}

// ─── Constants ────────────────────────────────────────────

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const TIMEOUT_MS = 8000;

// ─── Helpers ──────────────────────────────────────────────

function clampLimit(limit?: number): number {
  const l = limit ?? DEFAULT_LIMIT;
  return Math.min(Math.max(1, l), MAX_LIMIT);
}

function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...init,
    signal: controller.signal,
    cache: "no-store",
  }).finally(() => clearTimeout(timeout));
}

// ─── Elektroskandia ───────────────────────────────────────

type ElektroskandiaProduct = {
  Artnr?: string;
  Label?: string;
  Varumärke?: string;
  Icon?: string;
  Url?: string;
  Kvantitet?: number;
  Sortkod?: string;
};

type ElektroskandiaResponse = {
  ProduktLista?: ElektroskandiaProduct[];
  TotaltAntalProdukter?: number;
  KategoriLista?: unknown[];
};

export async function searchElektroskandia(
  query: string,
  limit?: number
): Promise<WholesalerSearchResult> {
  const safeLimit = clampLimit(limit);

  try {
    const url = `https://www.elektroskandia.se/sok/sokautocomplete?id=${encodeURIComponent(query)}`;

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("[wholesaler] Elektroskandia search failed:", response.status);
      return { products: [], totalCount: 0, supplier: "ELEKTROSKANDIA" };
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      console.error("[wholesaler] Elektroskandia returned non-JSON response");
      return { products: [], totalCount: 0, supplier: "ELEKTROSKANDIA" };
    }

    const data = (await response.json()) as ElektroskandiaResponse;

    const products: WholesalerProduct[] = (data.ProduktLista ?? [])
      .slice(0, safeLimit)
      .map((item) => ({
        supplier: "ELEKTROSKANDIA" as const,
        articleNo: item.Artnr ?? "",
        name: item.Label ?? "",
        brand: item.Varumärke ?? undefined,
        price: null,
        unit: null,
        imageUrl: item.Icon ?? null,
        productUrl: item.Url
          ? `https://www.elektroskandia.se${item.Url}`
          : null,
        inStock: null,
      }));

    return {
      products,
      totalCount: data.TotaltAntalProdukter ?? products.length,
      supplier: "ELEKTROSKANDIA",
    };
  } catch (error) {
    console.error("[wholesaler] Elektroskandia search error:", error);
    return { products: [], totalCount: 0, supplier: "ELEKTROSKANDIA" };
  }
}

// ─── Ahlsell ──────────────────────────────────────────────

type AhlsellProductCard = {
  name?: string;
  description?: string;
  brand?: string;
  variantNumber?: string;
  mostRelevantVariantId?: string;
  firstVariationPageUrl?: string;
  image?: {
    url?: string;
  };
};

type AhlsellResponse = {
  productCards?: AhlsellProductCard[];
};

export async function searchAhlsell(
  query: string,
  limit?: number
): Promise<WholesalerSearchResult> {
  const safeLimit = clampLimit(limit);

  try {
    const url = `https://www.ahlsell.se/api/search?parameters.SearchPhrase=${encodeURIComponent(query)}`;

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("[wholesaler] Ahlsell search failed:", response.status);
      return { products: [], totalCount: 0, supplier: "AHLSELL" };
    }

    const data = (await response.json()) as AhlsellResponse;
    const productList = data.productCards ?? [];

    const products: WholesalerProduct[] = productList
      .slice(0, safeLimit)
      .map((item) => ({
        supplier: "AHLSELL" as const,
        articleNo: item.variantNumber ?? item.mostRelevantVariantId ?? "",
        name: item.name ?? "",
        description: item.description ?? undefined,
        brand: item.brand ?? undefined,
        price: null,
        unit: null,
        imageUrl: item.image?.url
          ? `https://www.ahlsell.se${item.image.url}`
          : null,
        productUrl: item.firstVariationPageUrl
          ? `https://www.ahlsell.se${item.firstVariationPageUrl}`
          : null,
        inStock: null,
      }));

    return {
      products,
      totalCount: productList.length,
      supplier: "AHLSELL",
    };
  } catch (error) {
    console.error("[wholesaler] Ahlsell search error:", error);
    return { products: [], totalCount: 0, supplier: "AHLSELL" };
  }
}

// ─── Combined Search ──────────────────────────────────────

export async function searchWholesalers(
  query: string,
  options?: {
    limit?: number;
    suppliers?: ("ELEKTROSKANDIA" | "AHLSELL")[];
  }
): Promise<{
  elektroskandia: WholesalerSearchResult | null;
  ahlsell: WholesalerSearchResult | null;
}> {
  const suppliers = options?.suppliers ?? ["ELEKTROSKANDIA", "AHLSELL"];
  const limit = clampLimit(options?.limit);

  const promises: Promise<
    | { type: "ELEKTROSKANDIA"; result: WholesalerSearchResult }
    | { type: "AHLSELL"; result: WholesalerSearchResult }
  >[] = [];

  if (suppliers.includes("ELEKTROSKANDIA")) {
    promises.push(
      searchElektroskandia(query, limit).then((result) => ({
        type: "ELEKTROSKANDIA" as const,
        result,
      }))
    );
  }

  if (suppliers.includes("AHLSELL")) {
    promises.push(
      searchAhlsell(query, limit).then((result) => ({
        type: "AHLSELL" as const,
        result,
      }))
    );
  }

  const settled = await Promise.allSettled(promises);

  let elektroskandia: WholesalerSearchResult | null = null;
  let ahlsell: WholesalerSearchResult | null = null;

  for (const item of settled) {
    if (item.status === "fulfilled") {
      if (item.value.type === "ELEKTROSKANDIA") {
        elektroskandia = item.value.result;
      } else {
        ahlsell = item.value.result;
      }
    }
  }

  return { elektroskandia, ahlsell };
}
