/**
 * Granular cache invalidation.
 *
 * Rules:
 *  - Stock change  → invalidate that card's detail + list pages containing it
 *  - Order placed  → invalidate affected cards only (not full catalog)
 *  - Admin bulk update → invalidate catalog lists (partial)
 *  - Catalog sync  → full invalidation (via existing invalidatePublicCatalogCache)
 *
 * Uses existing Upstash REST cache layer for read/write.
 */
import {
  PUBLIC_CARD_DETAIL_CACHE_PREFIX,
  PUBLIC_CARD_LIST_CACHE_PREFIX,
  PUBLIC_CARD_FILTERS_CACHE_KEY,
} from "./cache.js";
import { logEvent } from "./logger.js";
import { isRedisEnabled, redis } from "./redis.js";

const PREFIX_SCAN_COUNT = 200;

function safeParseCachedPayload(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function scanKeysByPrefix(prefix) {
  const keys = [];
  let cursor = "0";

  do {
    const [nextCursor, batch = []] = await redis.scan(cursor, {
      match: `${prefix}*`,
      count: PREFIX_SCAN_COUNT,
    });

    cursor = String(nextCursor || "0");
    keys.push(...batch);
  } while (cursor !== "0");

  return keys;
}

async function deleteKeys(keys) {
  if (!keys.length) {
    return 0;
  }

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.del(key);
  }
  await pipeline.exec();
  return keys.length;
}

async function invalidateListCachesForCardIds(cardIds) {
  const normalizedIds = new Set(cardIds.map((value) => Number(value)).filter(Number.isFinite));
  if (!normalizedIds.size) {
    return 0;
  }

  const listKeys = await scanKeysByPrefix(PUBLIC_CARD_LIST_CACHE_PREFIX);
  if (!listKeys.length) {
    return 0;
  }

  const listEntries = await Promise.all(listKeys.map((key) => redis.get(key).then((value) => [key, value])));
  const affectedKeys = [];

  for (const [key, rawValue] of listEntries) {
    const payload = safeParseCachedPayload(rawValue);
    const cards = Array.isArray(payload?.cards) ? payload.cards : [];
    const matchesCard = cards.some((card) => {
      const cardId = Number(card?.id ?? card?.card_id);
      return Number.isFinite(cardId) && normalizedIds.has(cardId);
    });

    if (matchesCard) {
      affectedKeys.push(key);
    }
  }

  return deleteKeys(affectedKeys);
}

async function invalidateCardDetailKeys(cardIds) {
  const detailKeys = cardIds
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .map((cardId) => `${PUBLIC_CARD_DETAIL_CACHE_PREFIX}:stock:${cardId}`);

  return deleteKeys(detailKeys);
}

/**
 * Invalidate cache for a single card.
 * Removes detail key + list pages that may contain it.
 */
export async function invalidateCardCache(cardId) {
  return invalidateCardsCache([cardId]);
}

/**
 * Invalidate cache for multiple cards (e.g., after an order).
 * More efficient than calling invalidateCardCache per card.
 */
export async function invalidateCardsCache(cardIds) {
  if (!isRedisEnabled() || !cardIds?.length) return;

  try {
    await Promise.all([
      invalidateCardDetailKeys(cardIds),
      invalidateListCachesForCardIds(cardIds),
    ]);
  } catch (error) {
    logEvent("SERVER_ERROR", "Multi-card cache invalidation failed", {
      count: cardIds.length,
      error,
    });
  }
}

/**
 * Invalidate filters cache (e.g., when rarity distribution changes).
 */
export async function invalidateFiltersCache() {
  if (!isRedisEnabled()) return;

  try {
    await redis.del(PUBLIC_CARD_FILTERS_CACHE_KEY);
  } catch (error) {
    logEvent("SERVER_ERROR", "Filters cache invalidation failed", {
      error,
    });
  }
}

/**
 * After an order: invalidate only the cards in that order.
 */
export async function invalidateOrderRelatedCache(orderItems) {
  if (!orderItems?.length) return;

  const cardIds = [...new Set(orderItems.map((item) => item.cardId))];
  await invalidateCardsCache(cardIds);
}

export async function invalidatePriceRelatedCache(cardIds) {
  if (!cardIds?.length) {
    return;
  }

  await invalidateCardsCache(cardIds);
}
