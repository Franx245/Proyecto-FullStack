import { prisma } from "./prisma.js";

const CACHE_TTL_MS = 1000 * 60 * 60 * 5;
const EMERGENCY_RATE = 1250.00;
const RATE_SOURCES = [
  "https://dolarapi.com/v1/dolares/oficial",
  "https://api.bluelytics.com.ar/v2/latest",
];

const rateCache = {
  value: null,
  updatedAt: 0,
  inflight: null,
};

function isCacheFresh() {
  return Number.isFinite(rateCache.value) && Date.now() - rateCache.updatedAt < CACHE_TTL_MS;
}

function normalizeRate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

async function fetchFromDolarApi(signal) {
  const response = await fetch(RATE_SOURCES[0], {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`dolarapi responded with ${response.status}`);
  }

  const payload = await response.json();
  return normalizeRate(payload?.venta ?? payload?.promedio ?? payload?.value_avg);
}

async function fetchFromBluelytics(signal) {
  const response = await fetch(RATE_SOURCES[1], {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`bluelytics responded with ${response.status}`);
  }

  const payload = await response.json();
  return normalizeRate(payload?.oficial?.value_sell ?? payload?.oficial?.venta);
}

async function fetchUsdToArsRate() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 8000);

  try {
    const primaryRate = await fetchFromDolarApi(controller.signal);
    if (primaryRate) {
      return primaryRate;
    }

    const fallbackRate = await fetchFromBluelytics(controller.signal);
    if (fallbackRate) {
      return fallbackRate;
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLastPersistedRate() {
  try {
    const lastOrder = await prisma.order.findFirst({
      where: { exchange_rate: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { exchange_rate: true },
    });
    return normalizeRate(lastOrder?.exchange_rate);
  } catch {
    return null;
  }
}

export async function getUsdToArsRate() {
  if (isCacheFresh()) {
    return rateCache.value;
  }

  if (rateCache.inflight) {
    return rateCache.inflight;
  }

  rateCache.inflight = (async () => {
    // Tier 1: external APIs
    const externalRate = await fetchUsdToArsRate();
    if (externalRate) {
      rateCache.value = externalRate;
      rateCache.updatedAt = Date.now();
      return externalRate;
    }

    // Stale in-memory cache is still better than DB/emergency
    if (Number.isFinite(rateCache.value)) {
      return rateCache.value;
    }

    // Tier 2: last persisted rate from DB
    const dbRate = await fetchLastPersistedRate();
    if (dbRate) {
      rateCache.value = dbRate;
      rateCache.updatedAt = Date.now();
      return dbRate;
    }

    // Tier 3: emergency static rate — checkout must never crash
    rateCache.value = EMERGENCY_RATE;
    rateCache.updatedAt = Date.now();
    return EMERGENCY_RATE;
  })().finally(() => {
    rateCache.inflight = null;
  });

  return rateCache.inflight;
}