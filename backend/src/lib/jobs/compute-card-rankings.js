import {
  cacheSet,
  PUBLIC_CARD_RANKINGS_CACHE_KEY,
  PUBLIC_CARD_RANKINGS_CACHE_TTL_SECONDS,
} from "../cache.js";
import { prisma } from "../prisma.js";
import { isRedisEnabled, redis } from "../redis.js";

const TOP_SELLING_LIMIT = 12;
const TOP_SEARCH_TERMS_LIMIT = 20;

async function readTopSearchTerms() {
  if (!isRedisEnabled()) {
    return [];
  }

  try {
    const rawEntries = await redis.zrange("analytics:catalog-search-terms", 0, TOP_SEARCH_TERMS_LIMIT - 1, {
      rev: true,
      withScores: true,
    });

    if (!Array.isArray(rawEntries)) {
      return [];
    }

    const terms = [];
    for (const entry of rawEntries) {
      if (Array.isArray(entry)) {
        const [term, score] = entry;
        if (!term) {
          continue;
        }

        terms.push({
          term: String(term),
          searches: Number(score || 0),
        });
        continue;
      }

      if (entry && typeof entry === "object") {
        const term = entry.member ?? entry.value ?? entry.term;
        const score = entry.score ?? entry.searches;
        if (!term) {
          continue;
        }

        terms.push({
          term: String(term),
          searches: Number(score || 0),
        });
      }
    }

    return terms;
  } catch {
    return [];
  }
}

export async function handleComputeCardRankings() {
  const [topSellingCards, topSearchTerms] = await Promise.all([
    prisma.card.findMany({
      where: { isVisible: true },
      select: {
        id: true,
        name: true,
        image: true,
        price: true,
        rarity: true,
        salesCount: true,
        updatedAt: true,
      },
      orderBy: [
        { salesCount: "desc" },
        { updatedAt: "desc" },
      ],
      take: TOP_SELLING_LIMIT,
    }),
    readTopSearchTerms(),
  ]);

  const payload = {
    topSellingCards,
    topSearchTerms,
    computedAt: new Date().toISOString(),
  };

  await cacheSet(PUBLIC_CARD_RANKINGS_CACHE_KEY, payload, PUBLIC_CARD_RANKINGS_CACHE_TTL_SECONDS);

  return {
    topSellingCount: topSellingCards.length,
    topSearchTermsCount: topSearchTerms.length,
  };
}