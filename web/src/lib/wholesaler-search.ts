/**
 * Wholesaler product search - Elektroskandia and Ahlsell
 *
 * Uses public search APIs to find products.
 * No authentication required for basic search functionality.
 */

export type WholesalerProduct = {
  supplier: "ELEKTROSKANDIA" | "AHLSELL";
  articleNo: string;
  name: string;
  description?: string;
  brand?: string;
  price?: number;
  unit?: string;
  imageUrl?: string;
  productUrl: string;
  inStock?: boolean;
};

export type SearchResult = {
  products: WholesalerProduct[];
  totalFound: number;
  supplier: "ELEKTROSKANDIA" | "AHLSELL";
};

// ─── Elektroskandia Search ─────────────────────────────────

type ElektroskandiaProduct = {
  Artikelnr?: string;
  Benamning?: string;
  Beskrivning?: string;
  Varumarke?: string;
  Pristext?: string;
  Enhet?: string;
  Bildurl?: string;
  Lagerstatus?: string;
};

type ElektroskandiaResponse = {
  Artiklar?: ElektroskandiaProduct[];
  AntalTraffar?: number;
};

export async function searchElektroskandia(
  query: string,
  limit: number = 10
): Promise<SearchResult> {
  try {
    // Elektroskandia/Sonepar requires browser-like headers and may need cookies
    // We use their search API with proper headers to mimic a browser request
    const response = await fetch("https://www.elektroskandia.se/sok/sokartiklar2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://www.elektroskandia.se",
        "Referer": "https://www.elektroskandia.se/s?s=" + encodeURIComponent(query),
      },
      body: JSON.stringify({
        soktext: query,
        antal: limit,
        startvarde: 0,
        sortering: "Relevans|Desc",
        valdaFacetter: [],
        isOnBelysningsPage: false,
        onlyInStock: false,
      }),
    });

    if (!response.ok) {
      // If API fails, return empty result (user can still search on website)
      console.error("[wholesaler] Elektroskandia search failed:", response.status);
      return { products: [], totalFound: 0, supplier: "ELEKTROSKANDIA" };
    }

    // Check if response is JSON (not HTML error page)
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      console.error("[wholesaler] Elektroskandia returned non-JSON response");
      return { products: [], totalFound: 0, supplier: "ELEKTROSKANDIA" };
    }

    const data = (await response.json()) as ElektroskandiaResponse;

    const products: WholesalerProduct[] = (data.Artiklar ?? []).map((item) => ({
      supplier: "ELEKTROSKANDIA" as const,
      articleNo: item.Artikelnr ?? "",
      name: item.Benamning ?? "",
      description: item.Beskrivning,
      brand: item.Varumarke,
      price: item.Pristext ? parsePrice(item.Pristext) : undefined,
      unit: item.Enhet,
      imageUrl: item.Bildurl ? `https://www.elektroskandia.se${item.Bildurl}` : undefined,
      productUrl: `https://www.elektroskandia.se/artikel/${item.Artikelnr}`,
      inStock: item.Lagerstatus?.toLowerCase().includes("lager"),
    }));

    return {
      products,
      totalFound: data.AntalTraffar ?? products.length,
      supplier: "ELEKTROSKANDIA",
    };
  } catch (error) {
    console.error("[wholesaler] Elektroskandia search error:", error);
    return { products: [], totalFound: 0, supplier: "ELEKTROSKANDIA" };
  }
}

// ─── Ahlsell Search ────────────────────────────────────────

type AhlsellProductCard = {
  code?: string;
  name?: string;
  description?: string;
  brand?: string;
  firstVariationPageUrl?: string;
  variantNumber?: string;
  image?: {
    url?: string;
    description?: string;
  };
};

type AhlsellResponse = {
  productCards?: AhlsellProductCard[];
  productCount?: number;
};

export async function searchAhlsell(
  query: string,
  limit: number = 10
): Promise<SearchResult> {
  try {
    const params = new URLSearchParams({
      "parameters.SearchPhrase": query,
      "parameters.PageSize": String(limit),
    });

    const response = await fetch(`https://www.ahlsell.se/api/search?${params}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.error("[wholesaler] Ahlsell search failed:", response.status);
      return { products: [], totalFound: 0, supplier: "AHLSELL" };
    }

    const data = (await response.json()) as AhlsellResponse;
    const productList = data.productCards ?? [];

    const products: WholesalerProduct[] = productList.map((item) => ({
      supplier: "AHLSELL" as const,
      articleNo: item.variantNumber ?? item.code ?? "",
      name: item.name ?? "",
      description: item.description,
      brand: item.brand,
      price: undefined, // Price requires login
      unit: undefined,
      imageUrl: item.image?.url ? `https://www.ahlsell.se${item.image.url}` : undefined,
      productUrl: item.firstVariationPageUrl
        ? `https://www.ahlsell.se${item.firstVariationPageUrl}`
        : `https://www.ahlsell.se/search?parameters.SearchPhrase=${encodeURIComponent(query)}`,
      inStock: undefined, // Stock requires login
    }));

    return {
      products,
      totalFound: data.productCount ?? products.length,
      supplier: "AHLSELL",
    };
  } catch (error) {
    console.error("[wholesaler] Ahlsell search error:", error);
    return { products: [], totalFound: 0, supplier: "AHLSELL" };
  }
}

// ─── Combined Search ───────────────────────────────────────

export type CombinedSearchOptions = {
  suppliers?: ("ELEKTROSKANDIA" | "AHLSELL")[];
  limit?: number;
};

export async function searchWholesalers(
  query: string,
  options: CombinedSearchOptions = {}
): Promise<{ results: WholesalerProduct[]; totalFound: number }> {
  const { suppliers = ["ELEKTROSKANDIA", "AHLSELL"], limit = 10 } = options;

  const searches: Promise<SearchResult>[] = [];

  if (suppliers.includes("ELEKTROSKANDIA")) {
    searches.push(searchElektroskandia(query, limit));
  }
  if (suppliers.includes("AHLSELL")) {
    searches.push(searchAhlsell(query, limit));
  }

  const results = await Promise.all(searches);

  const allProducts = results.flatMap((r) => r.products);
  const totalFound = results.reduce((sum, r) => sum + r.totalFound, 0);

  return {
    results: allProducts.slice(0, limit * suppliers.length),
    totalFound,
  };
}

// ─── Helpers ───────────────────────────────────────────────

function parsePrice(priceText: string): number | undefined {
  // Extract numeric value from price text like "123,45 kr" or "123.45 SEK"
  const match = priceText.replace(/\s/g, "").match(/[\d,\.]+/);
  if (!match) return undefined;

  // Convert Swedish decimal format (123,45) to number
  const normalized = match[0].replace(",", ".");
  const value = parseFloat(normalized);

  return isNaN(value) ? undefined : value;
}
