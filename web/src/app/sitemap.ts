import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://arbetsytan.se";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/login", "/register"];

  const entries: MetadataRoute.Sitemap = [];

  for (const route of routes) {
    for (const locale of routing.locales) {
      const path = locale === routing.defaultLocale ? route : `/${locale}${route}`;
      entries.push({
        url: `${BASE_URL}${path}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "weekly" : "monthly",
        priority: route === "" ? 1.0 : 0.5,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((l) => [
              l,
              `${BASE_URL}${l === routing.defaultLocale ? route : `/${l}${route}`}`,
            ])
          ),
        },
      });
    }
  }

  return entries;
}
