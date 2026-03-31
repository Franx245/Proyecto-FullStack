import { getRedisBackendName, isRedisEnabled, redis } from "./redis.js";
import { recordCacheHit, recordCacheMiss } from "./metrics.js";

const PREFIX_SCAN_COUNT = 200;
const CACHE_LOG_ENABLED = process.env.NODE_ENV !== "production" || process.env.REDIS_CACHE_LOGS === "true";

/** @type {Map<string, Promise<any>>} */
const inflightRequests = new Map();

// ── In-memory LRU fallback when Redis is not available ──
const MEMORY_CACHE_MAX_ENTRIES = 500;
/** @type {Map<string, { value: unknown, expiresAt: number }>} */
const memoryCache = new Map();

/** @param {string} key */
function memoryCacheGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  // Move to end (LRU)
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.value;
}

/** @param {string} key @param {unknown} value @param {number} ttlSeconds */
function memoryCacheSet(key, value, ttlSeconds) {
  if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
    // Evict oldest entry
    const firstKey = memoryCache.keys().next().value;
    if (firstKey !== undefined) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** @param {string} prefix */
function memoryCacheDelByPrefix(prefix) {
  let count = 0;
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      count++;
    }
  }
  return count;
}

export const PUBLIC_CATALOG_CACHE_VERSION = "v1";
export const PUBLIC_CARD_LIST_CACHE_PREFIX = `cards:${PUBLIC_CATALOG_CACHE_VERSION}`;
export const PUBLIC_CARD_FILTERS_CACHE_PREFIX = `filters:${PUBLIC_CATALOG_CACHE_VERSION}`;
export const PUBLIC_CARD_DETAIL_CACHE_PREFIX = `card-detail:${PUBLIC_CATALOG_CACHE_VERSION}`;
export const PUBLIC_CARD_RANKINGS_CACHE_KEY = `rankings:${PUBLIC_CATALOG_CACHE_VERSION}`;
export const PUBLIC_CARD_FILTERS_CACHE_KEY = PUBLIC_CARD_FILTERS_CACHE_PREFIX;
export const PUBLIC_CARD_LIST_CACHE_TTL_SECONDS = 45;
export const PUBLIC_CARD_DETAIL_CACHE_TTL_SECONDS = 120;
export const PUBLIC_CARD_FILTERS_CACHE_TTL_SECONDS = 60 * 60;
export const PUBLIC_CARD_RANKINGS_CACHE_TTL_SECONDS = 60 * 15;
export const DASHBOARD_CACHE_KEY = "dashboard:v1";
export const DASHBOARD_CACHE_TTL_SECONDS = 30;

/**
 * Structured JSON log for cache operations.
 * @param {"hit"|"miss"|"set"|"invalidate"} event
 * @param {Record<string, unknown>} metadata
 */
function logCache(event, metadata) {
  if (!CACHE_LOG_ENABLED) {
    return;
  }

  console.info(JSON.stringify({
    level: "info",
    component: "cache",
    event,
    backend: getRedisBackendName(),
    ts: new Date().toISOString(),
    ...metadata,
  }));
}

function parseCachedValue(key, value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("[cache] parse failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function cacheGet(key) {
  if (!isRedisEnabled()) {
    const memValue = memoryCacheGet(key);
    if (memValue !== null) {
      logCache("hit", { key, latency_ms: 0, backend: "memory" });
      void recordCacheHit();
      return memValue;
    }
    logCache("miss", { key, latency_ms: 0, backend: "memory" });
    void recordCacheMiss();
    return null;
  }

  const t0 = Date.now();
  try {
    const cachedValue = await redis.get(key);
    const latencyMs = Date.now() - t0;
    if (cachedValue === null || cachedValue === undefined) {
      logCache("miss", { key, latency_ms: latencyMs });
      void recordCacheMiss();
      return null;
    }

    const parsedValue = parseCachedValue(key, cachedValue);
    if (parsedValue === null && cachedValue !== "null") {
      logCache("miss", { key, reason: "invalid_json", latency_ms: latencyMs });
      void recordCacheMiss();
      return null;
    }

    logCache("hit", { key, latency_ms: latencyMs });
    void recordCacheHit();
    return parsedValue;
  } catch (error) {
    console.error("[cache] get failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  if (!isRedisEnabled()) {
    memoryCacheSet(key, value, ttlSeconds);
    return true;
  }

  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    logCache("set", { key, ttl: ttlSeconds });
    return true;
  } catch (error) {
    console.error("[cache] set failed", {
      key,
      ttlSeconds,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Cache-aside with singleflight: prevents stampede on cache miss.
 * If many concurrent requests miss the same key, only ONE calls `fetchFn`;
 * the rest await the same in-flight promise.
 *
 * @template T
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} fetchFn
 * @returns {Promise<T>}
 */
export async function cacheGetOrFetch(key, ttlSeconds, fetchFn) {
  const cached = await cacheGet(key);
  if (cached !== null) {
    return cached;
  }

  const inflight = inflightRequests.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = fetchFn().then(
    (value) => {
      inflightRequests.delete(key);
      if (value !== null && value !== undefined) {
        void cacheSet(key, value, ttlSeconds);
      }
      return value;
    },
    (error) => {
      inflightRequests.delete(key);
      throw error;
    },
  );

  inflightRequests.set(key, promise);
  return promise;
}

export async function cacheDelByPrefix(prefix) {
  const memDeleted = memoryCacheDelByPrefix(prefix);
  if (!isRedisEnabled()) {
    return memDeleted;
  }

  try {
    const keysToDelete = [];
    let cursor = "0";

    do {
      const [nextCursor, keys = []] = await redis.scan(cursor, {
        match: `${prefix}*`,
        count: PREFIX_SCAN_COUNT,
      });

      cursor = String(nextCursor || "0");
      for (const key of keys) {
        keysToDelete.push(key);
      }
    } while (cursor !== "0");

    if (!keysToDelete.length) {
      return 0;
    }

    const pipeline = redis.pipeline();
    for (const key of keysToDelete) {
      pipeline.del(key);
    }

    await pipeline.exec();
    return keysToDelete.length;
  } catch (error) {
    console.error("[cache] invalidate failed", {
      prefix,
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

export async function invalidatePublicCatalogCache() {
  const t0 = Date.now();
  const [cardsDeleted, filtersDeleted, detailDeleted] = await Promise.all([
    cacheDelByPrefix(PUBLIC_CARD_LIST_CACHE_PREFIX),
    cacheDelByPrefix(PUBLIC_CARD_FILTERS_CACHE_PREFIX),
    cacheDelByPrefix(PUBLIC_CARD_DETAIL_CACHE_PREFIX),
  ]);

  // Also invalidate dashboard so admin KPIs reflect mutations immediately
  let dashboardDeleted = 0;
  try {
    if (isRedisEnabled()) {
      await redis.del(DASHBOARD_CACHE_KEY);
      dashboardDeleted = 1;
    }
  } catch { /* best effort */ }

  const result = { cardsDeleted, filtersDeleted, detailDeleted, dashboardDeleted };
  logCache("invalidate", { ...result, latency_ms: Date.now() - t0 });
  return result;
}

/**
 * Selectively invalidate only card-detail cache for specific card IDs.
 * Avoids nuking the entire catalog cache when only specific cards change.
 *
 * @param {number[]} cardIds
 */
export async function invalidateCardDetailCache(cardIds) {
  if (!isRedisEnabled() || !cardIds.length) {
    return 0;
  }

  try {
    const pipeline = redis.pipeline();
    for (const id of cardIds) {
      pipeline.del(`${PUBLIC_CARD_DETAIL_CACHE_PREFIX}:stock:${id}`);
    }
    await pipeline.exec();
    logCache("invalidate", { scope: "card-detail", cardIds, count: cardIds.length });
    return cardIds.length;
  } catch {
    return 0;
  }
}