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
    const response = await fetch("https://www.elektroskandia.se/sok/sokartiklar2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "ArbetsYtan/1.0",
      },
      body: JSON.stringify({
        soktext: query,
        antal: limit,
        startvarde: 0,
        sortering: "popularitet",
      }),
    });

    if (!response.ok) {
      console.error("[wholesaler] Elektroskandia search failed:", response.status);
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
      imageUrl: item.Bildurl,
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

type AhlsellProduct = {
  ArticleNumber?: string;
  Name?: string;
  Description?: string;
  Brand?: string;
  Price?: { Value?: number; FormattedValue?: string };
  Unit?: string;
  ImageUrl?: string;
  Url?: string;
  InStock?: boolean;
  StockStatus?: string;
};

type AhlsellResponse = {
  Products?: AhlsellProduct[];
  TotalCount?: number;
  SearchResults?: {
    Products?: AhlsellProduct[];
    TotalCount?: number;
  };
};

export async function searchAhlsell(
  query: string,
  limit: number = 10
): Promise<SearchResult> {
  try {
    const params = new URLSearchParams({
      "parameters.SearchPhrase": query,
      "parameters.PageSize": String(limit),
      "parameters.PageNumber": "1",
    });

    const response = await fetch(`https://www.ahlsell.se/api/search?${params}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "ArbetsYtan/1.0",
      },
    });

    if (!response.ok) {
      console.error("[wholesaler] Ahlsell search failed:", response.status);
      return { products: [], totalFound: 0, supplier: "AHLSELL" };
    }

    const data = (await response.json()) as AhlsellResponse;
    const productList = data.Products ?? data.SearchResults?.Products ?? [];

    const products: WholesalerProduct[] = productList.map((item) => ({
      supplier: "AHLSELL" as const,
      articleNo: item.ArticleNumber ?? "",
      name: item.Name ?? "",
      description: item.Description,
      brand: item.Brand,
      price: item.Price?.Value,
      unit: item.Unit,
      imageUrl: item.ImageUrl ? `https://www.ahlsell.se${item.ImageUrl}` : undefined,
      productUrl: item.Url ? `https://www.ahlsell.se${item.Url}` : `https://www.ahlsell.se/search?parameters.SearchPhrase=${encodeURIComponent(query)}`,
      inStock: item.InStock ?? item.StockStatus?.toLowerCase().includes("lager"),
    }));

    return {
      products,
      totalFound: data.TotalCount ?? data.SearchResults?.TotalCount ?? products.length,
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
