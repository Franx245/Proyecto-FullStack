/** @type {{ rarities: string[], cardTypes: string[], conditions: string[], sets: string[], priceRange: { label: string, min: number, max: number | null } | null }} */
const DEFAULT_FILTERS = /** @type {*} */ (Object.freeze({
  rarities: [],
  cardTypes: [],
  conditions: [],
  sets: [],
  priceRange: null,
}));

const PRICE_RANGES = Object.freeze([
  { label: "Under $5", min: 0, max: 5 },
  { label: "$5 – $25", min: 5, max: 25 },
  { label: "$25 – $100", min: 25, max: 100 },
  { label: "$100+", min: 100, max: null },
]);

const CATALOG_LAST_HREF_KEY = "duelvault_catalog_last_href";
const CATALOG_SCROLL_PREFIX = "duelvault_catalog_scroll:";
const CATALOG_STATE_PREFIX = "duelvault_catalog_state:";
const CATALOG_STATE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

/** @param {"localStorage" | "sessionStorage"} storageName */
function getSafeStorage(storageName) {
  if (typeof window === "undefined") {
    return null;
  }

  /** @type {Storage | undefined} */
  const storage = window[storageName];
  return storage && typeof storage.getItem === "function" ? storage : null;
}

/** @param {*} value */
function hasSearchParamMethods(value) {
  return Boolean(value && typeof value.get === "function" && typeof value.getAll === "function");
}

/**
 * @param {*} source
 * @param {string} key
 */
function collectRawValues(source, key) {
  if (!source) {
    return [];
  }

  if (hasSearchParamMethods(source)) {
    const values = source.getAll(key);
    if (values.length > 0) {
      return values;
    }

    const singleValue = source.get(key);
    return singleValue == null ? [] : [singleValue];
  }

  const value = source[key];

  if (Array.isArray(value)) {
    return value;
  }

  return value == null ? [] : [value];
}

/** @param {string[]} values */
function normalizeUniqueValues(values) {
  return [...new Set(
    values
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

/**
 * @param {*} source
 * @param {string[]} keys
 */
function getSingleValue(source, keys) {
  for (const key of keys) {
    const rawValues = collectRawValues(source, key);
    const firstValue = rawValues.find((/** @type {*} */ value) => String(value).trim() !== "");

    if (firstValue != null) {
      return String(firstValue).trim();
    }
  }

  return "";
}

/**
 * @param {*} source
 * @param {string[]} keys
 */
function getMultiValue(source, keys) {
  const values = [];

  for (const key of keys) {
    values.push(...collectRawValues(source, key));
  }

  return normalizeUniqueValues(values);
}

/** @param {string} value */
function parsePage(value) {
  const parsedValue = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;
}

/**
 * @param {number | null} minPrice
 * @param {number | null} maxPrice
 */
function findPriceRange(minPrice, maxPrice) {
  return PRICE_RANGES.find((range) => range.min === minPrice && (range.max ?? null) === (maxPrice ?? null)) ?? null;
}

/** @param {*} source */
export function parseCatalogSearchParams(source) {
  const minPriceValue = getSingleValue(source, ["minPrice"]);
  const maxPriceValue = getSingleValue(source, ["maxPrice"]);
  const minPrice = minPriceValue === "" ? null : Number.parseFloat(minPriceValue);
  const maxPrice = maxPriceValue === "" ? null : Number.parseFloat(maxPriceValue);

  return {
    search: getSingleValue(source, ["q"]),
    page: parsePage(getSingleValue(source, ["page"])),
    filters: {
      rarities: getMultiValue(source, ["rarities", "rarity"]),
      cardTypes: getMultiValue(source, ["cardTypes", "cardType", "type"]),
      conditions: getMultiValue(source, ["conditions", "condition"]),
      sets: getMultiValue(source, ["sets", "set"]),
      priceRange: Number.isFinite(minPrice) ? findPriceRange(minPrice, Number.isFinite(maxPrice) ? maxPrice : null) : null,
    },
  };
}

export function buildCatalogSearchParams({ search = "", page = 1, filters = DEFAULT_FILTERS } = {}) {
  const params = new URLSearchParams();
  const normalizedSearch = typeof search === "string" ? search.trim() : "";

  if (normalizedSearch) {
    params.set("q", normalizedSearch);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  normalizeUniqueValues(filters?.rarities ?? []).forEach((value) => params.append("rarities", value));
  normalizeUniqueValues(filters?.cardTypes ?? []).forEach((value) => params.append("cardTypes", value));
  normalizeUniqueValues(filters?.conditions ?? []).forEach((value) => params.append("conditions", value));
  normalizeUniqueValues(filters?.sets ?? []).forEach((value) => params.append("sets", value));

  if (filters?.priceRange) {
    params.set("minPrice", String(filters.priceRange.min));
    if (typeof filters.priceRange.max === "number") {
      params.set("maxPrice", String(filters.priceRange.max));
    }
  }

  return params;
}

/**
 * @param {string} pathname
 * @param {*} state
 */
export function buildCatalogHref(pathname, state) {
  const params = buildCatalogSearchParams(state);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** @param {*} state */
export function hasActiveCatalogState(state) {
  if (!state || typeof state !== "object") {
    return false;
  }

  return Boolean(
    String(state.search || "").trim() ||
    Number(state.page || 1) > 1 ||
    state.filters?.rarities?.length ||
    state.filters?.cardTypes?.length ||
    state.filters?.conditions?.length ||
    state.filters?.sets?.length ||
    state.filters?.priceRange
  );
}

/**
 * @param {string} pathname
 * @param {*} state
 */
export function persistCatalogState(pathname, state) {
  const storage = getSafeStorage("localStorage");
  if (!storage || !pathname) {
    return;
  }

  try {
    storage.setItem(`${CATALOG_STATE_PREFIX}${pathname}`, JSON.stringify({
      updatedAt: Date.now(),
      state,
    }));
  } catch {}
}

/** @param {string} pathname */
export function readCatalogState(pathname) {
  const storage = getSafeStorage("localStorage");
  if (!storage || !pathname) {
    return null;
  }

  try {
    const rawValue = storage.getItem(`${CATALOG_STATE_PREFIX}${pathname}`);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      storage.removeItem(`${CATALOG_STATE_PREFIX}${pathname}`);
      return null;
    }

    if (Date.now() - Number(parsedValue.updatedAt || 0) > CATALOG_STATE_MAX_AGE) {
      storage.removeItem(`${CATALOG_STATE_PREFIX}${pathname}`);
      return null;
    }

    return parsedValue.state ?? null;
  } catch {
    try {
      storage.removeItem(`${CATALOG_STATE_PREFIX}${pathname}`);
    } catch {}
    return null;
  }
}

/** @param {string} href */
export function persistLastCatalogHref(href) {
  const storage = getSafeStorage("localStorage");
  if (!storage || !href) {
    return;
  }

  try {
    storage.setItem(CATALOG_LAST_HREF_KEY, href);
  } catch {}
}

export function readLastCatalogHref(fallbackHref = "/singles") {
  const storage = getSafeStorage("localStorage");
  if (!storage) {
    return fallbackHref;
  }

  try {
    return storage.getItem(CATALOG_LAST_HREF_KEY) || fallbackHref;
  } catch {
    return fallbackHref;
  }
}

/**
 * @param {string} href
 * @param {number} scrollY
 */
export function persistCatalogScroll(href, scrollY) {
  const storage = getSafeStorage("sessionStorage");
  if (!storage || !href) {
    return;
  }

  try {
    storage.setItem(`${CATALOG_SCROLL_PREFIX}${href}`, JSON.stringify({
      updatedAt: Date.now(),
      scrollY: Math.max(0, Number(scrollY || 0)),
    }));
  } catch {}
}

/** @param {string} href */
export function readCatalogScroll(href) {
  const storage = getSafeStorage("sessionStorage");
  if (!storage || !href) {
    return null;
  }

  try {
    const rawValue = storage.getItem(`${CATALOG_SCROLL_PREFIX}${href}`);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    const scrollY = Number(parsedValue?.scrollY);
    return Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : null;
  } catch {
    return null;
  }
}

export { DEFAULT_FILTERS };