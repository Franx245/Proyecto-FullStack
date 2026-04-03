import { buildCardPath } from "@/lib/seo";
import { resolveSiteUrl } from "@/lib/site";

const BASE_URL = resolveSiteUrl();
const MAX_SITEMAP_PAGES = 100;

export const revalidate = 3600;

/** @typedef {RequestInit & { next?: { revalidate?: number } }} NextFetchOptions */

/**
 * @param {string} url
 * @param {number} revalidate
 */
async function fetchJson(url, revalidate) {
  const response = await fetch(url, /** @type {NextFetchOptions} */ ({
    next: { revalidate },
  }));

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function sitemap() {
  const staticPages = [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/singles`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/singles/monster`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/singles/spell`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/singles/trap`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/cart`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  /** @type {{ url: string, changeFrequency: string, priority: number, lastModified?: Date }[]} */
  let cardPages = [];
  /** @type {{ url: string, changeFrequency: string, priority: number }[]} */
  let setPages = [];

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.BACKEND_URL || "https://proyecto-fullstack-production-8fe1.up.railway.app";
    if (apiBase) {
      const firstPage = await fetchJson(`${apiBase}/api/catalog?page=1&pageSize=50`, 3600);
      const totalPages = Math.min(Number(firstPage?.totalPages || 0), MAX_SITEMAP_PAGES);
      const cards = [...(firstPage?.cards ?? [])];

      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            fetchJson(`${apiBase}/api/catalog?page=${index + 2}&pageSize=50`, 3600)
          )
        );

        for (const page of remainingPages) {
          cards.push(...(page?.cards ?? []));
        }
      }

      const filtersPayload = await fetchJson(`${apiBase}/api/catalog/filters`, 3600);
      const sets = Array.isArray(filtersPayload?.filters?.sets) ? filtersPayload.filters.sets : [];

      cardPages = cards.map((card) => ({
        url: `${BASE_URL}${buildCardPath(card)}`,
        changeFrequency: "weekly",
        priority: 0.6,
        lastModified: card.updated_at ? new Date(card.updated_at) : undefined,
      }));

      setPages = sets.map((/** @type {string} */ setName) => ({
        url: `${BASE_URL}/singles?set=${encodeURIComponent(setName)}`,
        changeFrequency: "weekly",
        priority: 0.5,
      }));
    }
  } catch {
    // Sitemap generation should not fail the build
  }

  return [...staticPages, ...cardPages, ...setPages];
}
